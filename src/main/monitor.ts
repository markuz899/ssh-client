import { Client } from 'ssh2'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import type {
  ConnectInput,
  MonitorSnapshot,
  MonitorStatus,
  DiskUsage,
  ProcessInfo
} from '../shared/types'

interface CpuRaw {
  total: number
  idle: number
}

interface Monitor {
  id: string
  client: Client
  status: MonitorStatus
  ready: Promise<void>
  lastCpu?: CpuRaw
}

type EmitStatus = (id: string, status: MonitorStatus, message?: string) => void

const monitors = new Map<string, Monitor>()

// Script unico: stampa blocchi marcati così da fare una sola exec per campione.
const PROBE = [
  'echo "@@CPU"; cat /proc/stat | grep "^cpu"',
  'echo "@@MEM"; cat /proc/meminfo',
  'echo "@@LOAD"; cat /proc/loadavg',
  'echo "@@UP"; cat /proc/uptime',
  'echo "@@DISK"; df -Pk',
  'echo "@@PROC"; ps -eo pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -n 7',
  'echo "@@HOST"; uname -sr; hostname'
].join('; ')

function resolvePrivateKey(input: ConnectInput): Buffer | undefined {
  if (input.privateKey && input.privateKey.trim()) return Buffer.from(input.privateKey, 'utf8')
  if (input.keyPath) return readFileSync(input.keyPath)
  return undefined
}

export function openMonitor(input: ConnectInput, emit: EmitStatus): string {
  const id = randomUUID()
  const client = new Client()
  let resolveReady = (): void => undefined
  let rejectReady = (_e: Error): void => undefined
  const ready = new Promise<void>((res, rej) => {
    resolveReady = res
    rejectReady = rej
  })
  const monitor: Monitor = { id, client, status: 'connecting', ready }
  monitors.set(id, monitor)

  const setStatus = (status: MonitorStatus, message?: string): void => {
    monitor.status = status
    emit(id, status, message)
  }

  client.on('ready', () => {
    setStatus('ready')
    resolveReady()
  })
  client.on('error', (err) => {
    let msg = err.message
    if (/All configured authentication methods failed/i.test(err.message))
      msg = 'Autenticazione fallita.'
    setStatus('error', msg)
    rejectReady(new Error(msg))
  })
  client.on('close', () => {
    if (monitor.status !== 'error') setStatus('error', 'Connessione chiusa.')
  })

  setTimeout(() => {
    try {
      let privateKey: Buffer | undefined
      if (input.authMethod === 'key') {
        privateKey = resolvePrivateKey(input)
        if (!privateKey) {
          setStatus('error', 'Nessuna chiave privata fornita.')
          rejectReady(new Error('no key'))
          return
        }
      }
      client.connect({
        host: input.host,
        port: input.port,
        username: input.username,
        privateKey,
        passphrase: input.passphrase,
        password: input.authMethod === 'password' ? input.password : undefined,
        agent: input.authMethod === 'agent' ? process.env.SSH_AUTH_SOCK : undefined,
        readyTimeout: 20000,
        keepaliveInterval: 15000
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus('error', msg)
      rejectReady(new Error(msg))
    }
  }, 0)

  return id
}

function execProbe(client: Client): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec(PROBE, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      stream.on('data', (c: Buffer) => (out += c.toString('utf8')))
      stream.stderr.on('data', () => undefined)
      stream.on('close', () => resolve(out))
    })
  })
}

function section(raw: string, name: string): string[] {
  const markers = ['CPU', 'MEM', 'LOAD', 'UP', 'DISK', 'PROC', 'HOST']
  const start = raw.indexOf(`@@${name}`)
  if (start === -1) return []
  let end = raw.length
  for (const m of markers) {
    const idx = raw.indexOf(`@@${m}`, start + 1)
    if (idx !== -1 && idx < end) end = idx
  }
  return raw
    .slice(start, end)
    .split('\n')
    .slice(1) // scarta la riga del marcatore
    .filter((l) => l.trim().length > 0)
}

function parseCpuRaw(lines: string[]): CpuRaw | undefined {
  const parts = lines[0]?.trim().split(/\s+/).slice(1).map(Number)
  if (!parts || parts.length < 4) return undefined
  const idle = (parts[3] ?? 0) + (parts[4] ?? 0) // idle + iowait
  const total = parts.reduce((a, b) => a + (b || 0), 0)
  return { total, idle }
}

function parseMeminfo(lines: string[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const l of lines) {
    const match = l.match(/^(\w+):\s+(\d+)/)
    if (match) m[match[1]] = Number(match[2])
  }
  return m
}

function parseDisks(lines: string[]): DiskUsage[] {
  const skip = /^(tmpfs|devtmpfs|udev|overlay|squashfs|none)/
  const out: DiskUsage[] = []
  for (const l of lines.slice(1)) {
    const cols = l.trim().split(/\s+/)
    if (cols.length < 6) continue
    const filesystem = cols[0]
    if (skip.test(filesystem)) continue
    const sizeKb = Number(cols[1])
    if (!sizeKb) continue
    out.push({
      filesystem,
      sizeKb,
      usedKb: Number(cols[2]),
      availKb: Number(cols[3]),
      percent: Number((cols[4] || '0').replace('%', '')),
      mount: cols.slice(5).join(' ')
    })
  }
  return out
}

function parseProcesses(lines: string[]): ProcessInfo[] {
  return lines.slice(1).map((l) => {
    const cols = l.trim().split(/\s+/)
    return {
      cpu: Number(cols[0]) || 0,
      mem: Number(cols[1]) || 0,
      command: cols.slice(2).join(' ')
    }
  })
}

export async function sampleMonitor(id: string): Promise<MonitorSnapshot> {
  const monitor = monitors.get(id)
  if (!monitor) throw new Error('Monitor non trovato')
  await monitor.ready
  const raw = await execProbe(monitor.client)

  const cpuRaw = parseCpuRaw(section(raw, 'CPU'))
  let cpuPercent = 0
  if (cpuRaw && monitor.lastCpu) {
    const totalDelta = cpuRaw.total - monitor.lastCpu.total
    const idleDelta = cpuRaw.idle - monitor.lastCpu.idle
    if (totalDelta > 0) cpuPercent = Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100))
  }
  if (cpuRaw) monitor.lastCpu = cpuRaw

  const mem = parseMeminfo(section(raw, 'MEM'))
  const memTotal = mem.MemTotal ?? 0
  const memAvail = mem.MemAvailable ?? mem.MemFree ?? 0
  const memUsed = Math.max(0, memTotal - memAvail)
  const swapTotal = mem.SwapTotal ?? 0
  const swapUsed = Math.max(0, swapTotal - (mem.SwapFree ?? 0))

  const loadLine = section(raw, 'LOAD')[0]?.trim().split(/\s+/) ?? []
  const load: [number, number, number] = [
    Number(loadLine[0]) || 0,
    Number(loadLine[1]) || 0,
    Number(loadLine[2]) || 0
  ]

  const uptimeSec = Number(section(raw, 'UP')[0]?.trim().split(/\s+/)[0]) || 0

  const hostLines = section(raw, 'HOST')

  return {
    at: Date.now(),
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    cores: countCores(section(raw, 'CPU')),
    load,
    mem: {
      totalKb: memTotal,
      usedKb: memUsed,
      availableKb: memAvail,
      percent: memTotal ? Math.round((memUsed / memTotal) * 1000) / 10 : 0
    },
    swap: {
      totalKb: swapTotal,
      usedKb: swapUsed,
      percent: swapTotal ? Math.round((swapUsed / swapTotal) * 1000) / 10 : 0
    },
    uptimeSec,
    disks: parseDisks(section(raw, 'DISK')),
    processes: parseProcesses(section(raw, 'PROC')),
    host: { os: hostLines[0] ?? '', hostname: hostLines[1] ?? '' }
  }
}

// La sezione CPU contiene la riga aggregata "cpu " più una riga per core
// ("cpu0", "cpu1", ...). I core sono quindi le righe con un indice numerico.
function countCores(cpuLines: string[]): number {
  const cores = cpuLines.filter((l) => /^cpu\d+\s/.test(l.trim())).length
  return cores || 1
}

export function closeMonitor(id: string): void {
  const m = monitors.get(id)
  if (!m) return
  try {
    m.client.end()
  } catch {
    /* ignore */
  }
  monitors.delete(id)
}

export function closeAllMonitors(): void {
  for (const id of [...monitors.keys()]) closeMonitor(id)
}

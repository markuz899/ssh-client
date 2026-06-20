import { Client, type ClientChannel } from 'ssh2'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import type {
  ConnectInput,
  DockerContainer,
  DockerContainerAction,
  DockerEngineStatus,
  DockerInfo,
  DockerPort,
  DockerState,
  DockerStats
} from '../shared/types'

// ---- Engine: una connessione SSH persistente per server, riusata per tutte
// le interrogazioni Docker (ps, stats, azioni). Con riconnessione automatica. ----

interface Engine {
  id: string
  input: ConnectInput
  client: Client
  status: DockerEngineStatus
  /** Si risolve quando il client è pronto; si rigenera ad ogni riconnessione. */
  ready: Promise<void>
  resolveReady: () => void
  rejectReady: (e: Error) => void
  closedByUser: boolean
  attempt: number
  reconnectTimer?: NodeJS.Timeout
  emit: EmitStatus
}

type EmitStatus = (
  id: string,
  status: DockerEngineStatus,
  message?: string,
  attempt?: number
) => void

const MAX_RECONNECT = 6
const engines = new Map<string, Engine>()

function resolvePrivateKey(input: ConnectInput): Buffer | undefined {
  if (input.privateKey && input.privateKey.trim()) return Buffer.from(input.privateKey, 'utf8')
  if (input.keyPath) return readFileSync(input.keyPath)
  return undefined
}

function connectOptions(input: ConnectInput): Parameters<Client['connect']>[0] {
  let privateKey: Buffer | undefined
  if (input.authMethod === 'key') {
    privateKey = resolvePrivateKey(input)
    if (!privateKey) throw new Error('Nessuna chiave privata fornita.')
  }
  return {
    host: input.host,
    port: input.port,
    username: input.username,
    privateKey,
    passphrase: input.passphrase,
    password: input.authMethod === 'password' ? input.password : undefined,
    agent: input.authMethod === 'agent' ? process.env.SSH_AUTH_SOCK : undefined,
    readyTimeout: 20000,
    keepaliveInterval: 15000,
    keepaliveCountMax: 3
  }
}

function friendly(err: Error): string {
  const code = (err as NodeJS.ErrnoException).code
  if (code === 'ECONNREFUSED') return 'Connessione rifiutata: controlla host e porta.'
  if (code === 'ENOTFOUND') return 'Host non trovato: controlla l’indirizzo.'
  if (/All configured authentication methods failed/i.test(err.message))
    return 'Autenticazione fallita: chiave, passphrase o password non validi.'
  return err.message
}

function setStatus(
  engine: Engine,
  status: DockerEngineStatus,
  message?: string,
  attempt?: number
): void {
  engine.status = status
  engine.emit(engine.id, status, message, attempt ?? engine.attempt)
}

/** (Ri)costruisce il client SSH dell'engine e avvia la connessione. */
function buildClient(engine: Engine): void {
  const client = new Client()
  engine.client = client
  engine.ready = new Promise<void>((res, rej) => {
    engine.resolveReady = res
    engine.rejectReady = rej
  })

  client.on('ready', () => {
    engine.attempt = 0
    setStatus(engine, 'ready')
    engine.resolveReady()
  })

  client.on('error', (err) => {
    setStatus(engine, 'error', friendly(err))
    engine.rejectReady(new Error(friendly(err)))
  })

  client.on('close', () => {
    if (engine.closedByUser) return
    scheduleReconnect(engine)
  })

  setTimeout(() => {
    if (engine.closedByUser) return
    try {
      client.connect(connectOptions(engine.input))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus(engine, 'error', msg)
      engine.rejectReady(new Error(msg))
    }
  }, 0)
}

function scheduleReconnect(engine: Engine): void {
  if (engine.closedByUser) return
  if (engine.attempt >= MAX_RECONNECT) {
    setStatus(engine, 'error', 'Riconnessione non riuscita dopo più tentativi.')
    return
  }
  engine.attempt += 1
  // Backoff lineare con tetto: 2s, 4s, … fino a 15s.
  const delay = Math.min(engine.attempt * 2000, 15000)
  setStatus(engine, 'connecting', `Riconnessione in corso (tentativo ${engine.attempt})…`)
  engine.reconnectTimer = setTimeout(() => buildClient(engine), delay)
}

export function openDocker(input: ConnectInput, emit: EmitStatus): string {
  const id = randomUUID()
  const engine: Engine = {
    id,
    input,
    client: new Client(),
    status: 'connecting',
    ready: Promise.resolve(),
    resolveReady: () => undefined,
    rejectReady: () => undefined,
    closedByUser: false,
    attempt: 0,
    emit
  }
  engines.set(id, engine)
  buildClient(engine)
  return id
}

export function closeDocker(id: string): void {
  const engine = engines.get(id)
  if (!engine) return
  engine.closedByUser = true
  if (engine.reconnectTimer) clearTimeout(engine.reconnectTimer)
  try {
    engine.client.end()
  } catch {
    /* ignore */
  }
  engines.delete(id)
}

export function closeAllDocker(): void {
  for (const id of [...engines.keys()]) closeDocker(id)
}

interface RunResult {
  code: number
  out: string
  err: string
}

/** Esegue un comando sul server tramite l'engine, con timeout. */
function run(engine: Engine, command: string, timeoutMs = 15000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    engine.ready.then(
      () => {
        let settled = false
        const finish = (fn: () => void): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          fn()
        }
        const timer = setTimeout(
          () => finish(() => reject(new Error('Timeout del comando Docker.'))),
          timeoutMs
        )
        engine.client.exec(command, (err, stream) => {
          if (err) return finish(() => reject(err))
          let out = ''
          let errOut = ''
          stream.on('data', (c: Buffer) => (out += c.toString('utf8')))
          stream.stderr.on('data', (c: Buffer) => (errOut += c.toString('utf8')))
          stream.on('close', (code: number | null) =>
            finish(() => resolve({ code: code ?? 0, out, err: errOut }))
          )
        })
      },
      (e) => reject(e instanceof Error ? e : new Error(String(e)))
    )
  })
}

// ---- Rilevamento ----

export async function detectDocker(id: string): Promise<DockerInfo> {
  const engine = engines.get(id)
  if (!engine) throw new Error('Engine Docker non trovato.')
  // Un solo giro: verifica presenza del binario, poi interroga il daemon.
  const script =
    'if ! command -v docker >/dev/null 2>&1; then echo "@@MISSING"; ' +
    'else docker version --format "{{.Server.Version}}" 2>&1 || true; fi'
  const { out } = await run(engine, script, 12000)
  const text = out.trim()
  if (text === '' || text.includes('@@MISSING')) {
    return { installed: false, canConnect: false, message: 'Docker non è installato sul server.' }
  }
  // Una versione "pulita" è qualcosa tipo 24.0.7 / 27.1.1.
  const versionLine = text.split('\n').find((l) => /^\d+\.\d+/.test(l.trim()))
  if (versionLine) {
    return { installed: true, canConnect: true, serverVersion: versionLine.trim() }
  }
  // Binario presente ma daemon irraggiungibile o permessi mancanti.
  let message = text.split('\n').slice(-1)[0] || 'Impossibile contattare il daemon Docker.'
  if (/permission denied/i.test(text))
    message = 'Permessi insufficienti: l’utente non è nel gruppo docker.'
  else if (/Cannot connect to the Docker daemon/i.test(text))
    message = 'Il daemon Docker non è in esecuzione.'
  return { installed: true, canConnect: false, message }
}

// ---- Parsing porte / stato / byte ----

function parseState(raw: string): DockerState {
  const s = raw.toLowerCase()
  const known: DockerState[] = [
    'running',
    'exited',
    'paused',
    'created',
    'restarting',
    'removing',
    'dead'
  ]
  return known.find((k) => k === s) ?? 'unknown'
}

function parsePorts(raw: string): DockerPort[] {
  if (!raw || !raw.trim()) return []
  const ports: DockerPort[] = []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const seg = part.trim()
    if (!seg) continue
    // Forme: "0.0.0.0:8080->80/tcp", ":::8080->80/tcp", "80/tcp"
    const mapped = seg.match(/^(?:([\d.:a-f]+):)?(\d+)->(\d+)\/(\w+)$/i)
    if (mapped) {
      const key = `${mapped[2]}-${mapped[3]}-${mapped[4]}`
      if (seen.has(key)) continue
      seen.add(key)
      ports.push({
        ip: mapped[1],
        publicPort: Number(mapped[2]),
        privatePort: Number(mapped[3]),
        protocol: mapped[4].toLowerCase()
      })
      continue
    }
    const internal = seg.match(/^(\d+)\/(\w+)$/)
    if (internal) {
      ports.push({ privatePort: Number(internal[1]), protocol: internal[2].toLowerCase() })
    }
  }
  return ports
}

function parseCreatedAt(raw: string): number {
  // Formato Docker: "2024-06-20 09:26:00 +0200 CEST"
  const m = raw.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4})/)
  if (m) {
    const t = Date.parse(m[1].replace(' ', 'T').replace(/ ([+-]\d{4})$/, '$1'))
    if (!Number.isNaN(t)) return t
  }
  const t = Date.parse(raw)
  return Number.isNaN(t) ? 0 : t
}

/** Converte "12.5MiB", "1.2kB", "3.4GB"… in byte. Suffisso "iB" = base 1024. */
function parseSize(raw: string): number {
  if (!raw) return 0
  const m = raw.trim().match(/^([\d.]+)\s*([a-zA-Z]*)$/)
  if (!m) return 0
  const value = Number(m[1])
  if (Number.isNaN(value)) return 0
  const unit = m[2].toLowerCase()
  const factors: Record<string, number> = {
    '': 1,
    b: 1,
    kb: 1000,
    mb: 1000 ** 2,
    gb: 1000 ** 3,
    tb: 1000 ** 4,
    kib: 1024,
    mib: 1024 ** 2,
    gib: 1024 ** 3,
    tib: 1024 ** 4
  }
  return value * (factors[unit] ?? 1)
}

/** Spezza un campo "X / Y" in [X, Y] in byte. */
function parsePair(raw: string): [number, number] {
  const [a, b] = (raw || '').split('/')
  return [parseSize(a ?? ''), parseSize(b ?? '')]
}

function jsonLines(out: string): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (!t || t[0] !== '{') continue
    try {
      rows.push(JSON.parse(t))
    } catch {
      /* riga non interpretabile, ignora */
    }
  }
  return rows
}

// ---- Lista container ----

export async function listContainers(id: string): Promise<DockerContainer[]> {
  const engine = engines.get(id)
  if (!engine) throw new Error('Engine Docker non trovato.')
  const { out, err, code } = await run(
    engine,
    "docker ps -a --no-trunc --format '{{json .}}'",
    15000
  )
  if (code !== 0 && !out.trim()) throw new Error(err.trim() || 'Impossibile elencare i container.')
  return jsonLines(out).map((r) => ({
    id: r.ID ?? '',
    name: (r.Names ?? '').split(',')[0] || r.ID?.slice(0, 12) || 'sconosciuto',
    image: r.Image ?? '',
    state: parseState(r.State ?? ''),
    status: r.Status ?? '',
    ports: parsePorts(r.Ports ?? ''),
    createdAt: parseCreatedAt(r.CreatedAt ?? ''),
    command: (r.Command ?? '').replace(/^"|"$/g, '')
  }))
}

// ---- Statistiche risorse ----

export async function statsContainers(id: string): Promise<DockerStats[]> {
  const engine = engines.get(id)
  if (!engine) throw new Error('Engine Docker non trovato.')
  const { out, err, code } = await run(
    engine,
    "docker stats --no-stream --format '{{json .}}'",
    20000
  )
  if (code !== 0 && !out.trim()) throw new Error(err.trim() || 'Impossibile leggere le statistiche.')
  return jsonLines(out).map((r) => {
    const [memUsed, memLimit] = parsePair(r.MemUsage ?? '')
    const [rx, tx] = parsePair(r.NetIO ?? '')
    const [bread, bwrite] = parsePair(r.BlockIO ?? '')
    return {
      id: r.ID ?? r.Container ?? '',
      name: r.Name ?? '',
      cpuPercent: Number((r.CPUPerc ?? '0').replace('%', '')) || 0,
      memPercent: Number((r.MemPerc ?? '0').replace('%', '')) || 0,
      memUsedBytes: memUsed,
      memLimitBytes: memLimit,
      netRxBytes: rx,
      netTxBytes: tx,
      blockReadBytes: bread,
      blockWriteBytes: bwrite,
      pids: Number(r.PIDs ?? '0') || 0
    }
  })
}

// ---- Azioni rapide ----

export async function containerAction(
  id: string,
  action: DockerContainerAction,
  containerId: string
): Promise<void> {
  const engine = engines.get(id)
  if (!engine) throw new Error('Engine Docker non trovato.')
  if (!/^[a-zA-Z0-9_.-]+$/.test(containerId)) throw new Error('ID container non valido.')
  const verb = { start: 'start', stop: 'stop', restart: 'restart', remove: 'rm' }[action]
  const flags = action === 'stop' ? ' -t 10' : action === 'remove' ? ' -f' : ''
  const { code, err } = await run(engine, `docker ${verb}${flags} ${containerId}`, 40000)
  if (code !== 0) throw new Error(err.trim() || `Azione "${action}" non riuscita.`)
}

// ---- Shell interattiva: docker exec -it <id> <shell> ----

interface ExecSession {
  id: string
  client: Client
  stream?: ClientChannel
  status: 'connecting' | 'ready' | 'closed' | 'error'
}

type ExecEmitData = (execId: string, data: string) => void
type ExecEmitStatus = (
  execId: string,
  status: ExecSession['status'],
  message?: string
) => void

const execSessions = new Map<string, ExecSession>()

export function openExec(
  input: ConnectInput,
  containerId: string,
  emitData: ExecEmitData,
  emitStatus: ExecEmitStatus
): string {
  const id = randomUUID()
  const client = new Client()
  const session: ExecSession = { id, client, status: 'connecting' }
  execSessions.set(id, session)

  if (!/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
    setTimeout(() => emitStatus(id, 'error', 'ID container non valido.'), 0)
    return id
  }

  const setExecStatus = (status: ExecSession['status'], message?: string): void => {
    session.status = status
    emitStatus(id, status, message)
  }

  // Prova bash, ricade su sh. `-it` per allocare il tty dentro al container.
  const shellCmd =
    `docker exec -it ${containerId} ` +
    "sh -c 'exec $(command -v bash 2>/dev/null || command -v sh)'"

  client.on('ready', () => {
    client.exec(
      shellCmd,
      { pty: { term: 'xterm-256color', cols: input.cols ?? 80, rows: input.rows ?? 24 } },
      (err, stream) => {
        if (err) {
          setExecStatus('error', err.message)
          client.end()
          return
        }
        session.stream = stream
        setExecStatus('ready')
        stream.on('data', (c: Buffer) => emitData(id, c.toString('utf8')))
        stream.stderr.on('data', (c: Buffer) => emitData(id, c.toString('utf8')))
        stream.on('close', () => {
          setExecStatus('closed')
          client.end()
        })
      }
    )
  })

  client.on('error', (err) => setExecStatus('error', friendly(err)))
  client.on('close', () => {
    if (session.status !== 'error') setExecStatus('closed')
    execSessions.delete(id)
  })

  setTimeout(() => {
    try {
      client.connect(connectOptions(input))
    } catch (e) {
      setExecStatus('error', e instanceof Error ? e.message : String(e))
    }
  }, 0)

  return id
}

export function writeExec(execId: string, data: string): void {
  execSessions.get(execId)?.stream?.write(data)
}

export function resizeExec(execId: string, cols: number, rows: number): void {
  execSessions.get(execId)?.stream?.setWindow(rows, cols, 0, 0)
}

export function closeExec(execId: string): void {
  const s = execSessions.get(execId)
  if (!s) return
  try {
    s.stream?.end()
    s.client.end()
  } catch {
    /* ignore */
  }
  execSessions.delete(execId)
}

export function closeAllExec(): void {
  for (const id of [...execSessions.keys()]) closeExec(id)
}

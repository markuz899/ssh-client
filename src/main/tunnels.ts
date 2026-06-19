import { Client } from 'ssh2'
import { createServer, connect, type Server } from 'net'
import { readFileSync } from 'fs'
import type { ConnectInput, TunnelConfig, TunnelStatus } from '../shared/types'

interface RunningTunnel {
  client: Client
  server?: Server
  status: TunnelStatus
}

type EmitStatus = (id: string, status: TunnelStatus, message?: string) => void

const running = new Map<string, RunningTunnel>()

function resolvePrivateKey(input: ConnectInput): Buffer | undefined {
  if (input.privateKey && input.privateKey.trim()) return Buffer.from(input.privateKey, 'utf8')
  if (input.keyPath) return readFileSync(input.keyPath)
  return undefined
}

export function isActive(id: string): boolean {
  return running.get(id)?.status === 'active'
}

export function startTunnel(config: TunnelConfig, input: ConnectInput, emit: EmitStatus): void {
  if (running.has(config.id)) stopTunnel(config.id)

  const client = new Client()
  const entry: RunningTunnel = { client, status: 'starting' }
  running.set(config.id, entry)

  const setStatus = (status: TunnelStatus, message?: string): void => {
    entry.status = status
    emit(config.id, status, message)
  }
  setStatus('starting')

  const fail = (message: string): void => {
    setStatus('error', message)
    stopTunnel(config.id)
  }

  client.on('ready', () => {
    if (config.type === 'local') {
      // Server TCP locale: ogni connessione viene inoltrata sul server remoto.
      const server = createServer((socket) => {
        client.forwardOut(
          '127.0.0.1',
          socket.remotePort ?? 0,
          config.destHost,
          config.destPort,
          (err, stream) => {
            if (err) {
              socket.destroy()
              return
            }
            socket.pipe(stream).pipe(socket)
          }
        )
      })
      entry.server = server
      server.on('error', (err) => fail(`Porta locale non disponibile: ${err.message}`))
      server.listen(config.srcPort, '127.0.0.1', () => setStatus('active'))
    } else {
      // Forward remoto: il server apre la porta e inoltra verso la destinazione locale.
      client.forwardIn('127.0.0.1', config.srcPort, (err) => {
        if (err) return fail(`Impossibile aprire la porta remota: ${err.message}`)
        setStatus('active')
      })
      client.on('tcp connection', (_info, accept) => {
        const stream = accept()
        const socket = connect(config.destPort, config.destHost)
        socket.on('error', () => stream.end())
        stream.pipe(socket).pipe(stream)
      })
    }
  })

  client.on('error', (err) => fail(err.message))
  client.on('close', () => {
    if (entry.status === 'active') setStatus('inactive')
  })

  setTimeout(() => {
    try {
      let privateKey: Buffer | undefined
      if (input.authMethod === 'key') {
        privateKey = resolvePrivateKey(input)
        if (!privateKey) return fail('Nessuna chiave privata fornita.')
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
        keepaliveInterval: 20000
      })
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }, 0)
}

export function stopTunnel(id: string): void {
  const entry = running.get(id)
  if (!entry) return
  try {
    entry.server?.close()
    entry.client.end()
  } catch {
    /* ignore */
  }
  running.delete(id)
}

export function closeAllTunnels(): void {
  for (const id of [...running.keys()]) stopTunnel(id)
}

import { Client } from 'ssh2'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import type { ConnectInput, LogStatus } from '../shared/types'

interface LogSession {
  id: string
  client: Client
  status: LogStatus
}

type EmitData = (logId: string, chunk: string) => void
type EmitStatus = (logId: string, status: LogStatus, message?: string) => void

const sessions = new Map<string, LogSession>()

function resolvePrivateKey(input: ConnectInput): Buffer | undefined {
  if (input.privateKey && input.privateKey.trim()) return Buffer.from(input.privateKey, 'utf8')
  if (input.keyPath) return readFileSync(input.keyPath)
  return undefined
}

/** Avvia uno stream di log indipendente eseguendo `command` (es. `tail -F …`). */
export function startLog(
  input: ConnectInput,
  command: string,
  emitData: EmitData,
  emitStatus: EmitStatus
): string {
  const id = randomUUID()
  const client = new Client()
  const session: LogSession = { id, client, status: 'connecting' }
  sessions.set(id, session)

  const setStatus = (status: LogStatus, message?: string): void => {
    session.status = status
    emitStatus(id, status, message)
  }

  client.on('ready', () => {
    // PTY così che la chiusura del canale termini davvero `tail -F` sul server.
    client.exec(command, { pty: true }, (err, stream) => {
      if (err) {
        setStatus('error', err.message)
        client.end()
        return
      }
      setStatus('streaming')
      stream.on('data', (chunk: Buffer) => emitData(id, chunk.toString('utf8')))
      stream.stderr.on('data', (chunk: Buffer) => emitData(id, chunk.toString('utf8')))
      stream.on('close', () => {
        setStatus('closed')
        client.end()
      })
    })
  })

  client.on('error', (err) => {
    let msg = err.message
    if (/All configured authentication methods failed/i.test(err.message))
      msg = 'Autenticazione fallita.'
    setStatus('error', msg)
  })
  client.on('close', () => {
    if (session.status !== 'error' && session.status !== 'closed') setStatus('closed')
    sessions.delete(id)
  })

  setTimeout(() => {
    try {
      let privateKey: Buffer | undefined
      if (input.authMethod === 'key') {
        privateKey = resolvePrivateKey(input)
        if (!privateKey) {
          setStatus('error', 'Nessuna chiave privata fornita.')
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
        keepaliveInterval: 20000
      })
    } catch (e) {
      setStatus('error', e instanceof Error ? e.message : String(e))
    }
  }, 0)

  return id
}

export function stopLog(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  try {
    s.client.end()
  } catch {
    /* ignore */
  }
  sessions.delete(id)
}

export function closeAllLogs(): void {
  for (const id of [...sessions.keys()]) stopLog(id)
}

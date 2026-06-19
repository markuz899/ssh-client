import { Client, type ClientChannel } from 'ssh2'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import type { ConnectInput, SessionStatus } from '../shared/types'

interface Session {
  id: string
  client: Client
  stream?: ClientChannel
  status: SessionStatus
}

type Emit = (event:
  | { type: 'data'; sessionId: string; data: string }
  | { type: 'status'; sessionId: string; status: SessionStatus; message?: string }
) => void

const sessions = new Map<string, Session>()

function resolvePrivateKey(input: ConnectInput): Buffer | undefined {
  if (input.privateKey && input.privateKey.trim().length > 0) {
    return Buffer.from(input.privateKey, 'utf8')
  }
  if (input.keyPath) {
    return readFileSync(input.keyPath)
  }
  return undefined
}

export function createSession(input: ConnectInput, emit: Emit): string {
  const id = randomUUID()
  const client = new Client()
  const session: Session = { id, client, status: 'connecting' }
  sessions.set(id, session)

  const setStatus = (status: SessionStatus, message?: string): void => {
    session.status = status
    emit({ type: 'status', sessionId: id, status, message })
  }

  client.on('ready', () => {
    setStatus('authenticating')
    client.shell(
      { term: 'xterm-256color', cols: input.cols ?? 80, rows: input.rows ?? 24 },
      (err, stream) => {
        if (err) {
          setStatus('error', `Impossibile aprire la shell: ${err.message}`)
          client.end()
          return
        }
        session.stream = stream
        setStatus('ready')
        stream.on('data', (chunk: Buffer) =>
          emit({ type: 'data', sessionId: id, data: chunk.toString('utf8') })
        )
        stream.stderr.on('data', (chunk: Buffer) =>
          emit({ type: 'data', sessionId: id, data: chunk.toString('utf8') })
        )
        stream.on('close', () => {
          setStatus('closed')
          client.end()
        })
      }
    )
  })

  client.on('error', (err) => {
    // Messaggi più leggibili per i casi tipici.
    let msg = err.message
    if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED')
      msg = 'Connessione rifiutata: controlla host e porta.'
    if ((err as NodeJS.ErrnoException).code === 'ENOTFOUND')
      msg = 'Host non trovato: controlla l’indirizzo.'
    if (/All configured authentication methods failed/i.test(err.message))
      msg = 'Autenticazione fallita: chiave, passphrase o password non validi.'
    setStatus('error', msg)
  })

  client.on('close', () => {
    if (session.status !== 'error') setStatus('closed')
    sessions.delete(id)
  })

  // Avvio asincrono cosicché il chiamante riceva subito il sessionId.
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
        keepaliveInterval: 15000
      })
    } catch (e) {
      setStatus('error', e instanceof Error ? e.message : String(e))
    }
  }, 0)

  return id
}

export function writeToSession(sessionId: string, data: string): boolean {
  const s = sessions.get(sessionId)
  if (!s?.stream) return false
  s.stream.write(data)
  return true
}

export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const s = sessions.get(sessionId)
  s?.stream?.setWindow(rows, cols, 0, 0)
}

export function closeSession(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  try {
    s.stream?.end()
    s.client.end()
  } catch {
    /* ignore */
  }
  sessions.delete(sessionId)
}

export function closeAll(): void {
  for (const id of [...sessions.keys()]) closeSession(id)
}

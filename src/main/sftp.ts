import { Client, type SFTPWrapper } from 'ssh2'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import type { ConnectInput, SftpEntry, SftpEntryType, SftpStatus } from '../shared/types'

interface SftpSession {
  id: string
  client: Client
  sftp?: SFTPWrapper
  status: SftpStatus
  ready: Promise<SFTPWrapper>
}

type EmitStatus = (id: string, status: SftpStatus, message?: string) => void

const sessions = new Map<string, SftpSession>()

function resolvePrivateKey(input: ConnectInput): Buffer | undefined {
  if (input.privateKey && input.privateKey.trim()) return Buffer.from(input.privateKey, 'utf8')
  if (input.keyPath) return readFileSync(input.keyPath)
  return undefined
}

const S_IFMT = 0o170000
function modeToType(mode: number): SftpEntryType {
  const t = mode & S_IFMT
  if (t === 0o040000) return 'dir'
  if (t === 0o120000) return 'link'
  if (t === 0o100000) return 'file'
  return 'other'
}

function modeToPerms(mode: number): string {
  const rwx = (n: number): string =>
    `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`
  return rwx((mode >> 6) & 7) + rwx((mode >> 3) & 7) + rwx(mode & 7)
}

export function openSftp(input: ConnectInput, emit: EmitStatus): string {
  const id = randomUUID()
  const client = new Client()
  let resolveReady = (_w: SFTPWrapper): void => undefined
  let rejectReady = (_e: Error): void => undefined
  const ready = new Promise<SFTPWrapper>((res, rej) => {
    resolveReady = res
    rejectReady = rej
  })
  const session: SftpSession = { id, client, status: 'connecting', ready }
  sessions.set(id, session)

  const setStatus = (status: SftpStatus, message?: string): void => {
    session.status = status
    emit(id, status, message)
  }

  client.on('ready', () => {
    client.sftp((err, sftp) => {
      if (err) {
        setStatus('error', err.message)
        rejectReady(err)
        client.end()
        return
      }
      session.sftp = sftp
      setStatus('ready')
      resolveReady(sftp)
    })
  })
  client.on('error', (err) => {
    let msg = err.message
    if (/All configured authentication methods failed/i.test(err.message))
      msg = 'Autenticazione fallita.'
    setStatus('error', msg)
    rejectReady(new Error(msg))
  })
  client.on('close', () => {
    if (session.status !== 'error') setStatus('error', 'Connessione chiusa.')
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
        keepaliveInterval: 20000
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus('error', msg)
      rejectReady(new Error(msg))
    }
  }, 0)

  return id
}

async function wrapper(id: string): Promise<SFTPWrapper> {
  const session = sessions.get(id)
  if (!session) throw new Error('Sessione SFTP non trovata')
  return session.ready
}

export async function homeDir(id: string): Promise<string> {
  const sftp = await wrapper(id)
  return new Promise((resolve) => {
    sftp.realpath('.', (err, path) => resolve(err ? '/' : path))
  })
}

export async function listDir(id: string, path: string): Promise<SftpEntry[]> {
  const sftp = await wrapper(id)
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (err, list) => {
      if (err) return reject(err)
      const entries = list.map((item) => {
        const mode = item.attrs.mode ?? 0
        return {
          name: item.filename,
          type: modeToType(mode),
          size: item.attrs.size ?? 0,
          mtime: (item.attrs.mtime ?? 0) * 1000,
          mode: modeToPerms(mode)
        } as SftpEntry
      })
      entries.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1
        if (a.type !== 'dir' && b.type === 'dir') return 1
        return a.name.localeCompare(b.name)
      })
      resolve(entries)
    })
  })
}

export async function downloadFile(id: string, remotePath: string, localPath: string): Promise<void> {
  const sftp = await wrapper(id)
  return new Promise((resolve, reject) => {
    sftp.fastGet(remotePath, localPath, (err) => (err ? reject(err) : resolve()))
  })
}

export async function uploadFile(id: string, localPath: string, remotePath: string): Promise<void> {
  const sftp = await wrapper(id)
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => (err ? reject(err) : resolve()))
  })
}

export async function makeDir(id: string, path: string): Promise<void> {
  const sftp = await wrapper(id)
  return new Promise((resolve, reject) => {
    sftp.mkdir(path, (err) => (err ? reject(err) : resolve()))
  })
}

export async function removeEntry(id: string, path: string, isDir: boolean): Promise<void> {
  const sftp = await wrapper(id)
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null | undefined): void => (err ? reject(err) : resolve())
    if (isDir) sftp.rmdir(path, cb)
    else sftp.unlink(path, cb)
  })
}

export async function renameEntry(id: string, from: string, to: string): Promise<void> {
  const sftp = await wrapper(id)
  return new Promise((resolve, reject) => {
    sftp.rename(from, to, (err) => (err ? reject(err) : resolve()))
  })
}

export function closeSftp(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  try {
    s.client.end()
  } catch {
    /* ignore */
  }
  sessions.delete(id)
}

export function closeAllSftp(): void {
  for (const id of [...sessions.keys()]) closeSftp(id)
}

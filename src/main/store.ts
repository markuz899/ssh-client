import Store from 'electron-store'
import { safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import type { Connection, SavedCommand, TunnelConfig } from '../shared/types'

// Lo store su disco tiene SOLO i metadati delle connessioni in chiaro.
// I segreti (chiave privata, passphrase, password) vivono in un blob cifrato
// separato, protetto da safeStorage (Keychain su macOS).

interface Secret {
  privateKey?: string
  passphrase?: string
  password?: string
}

interface Schema {
  connections: Connection[]
  // Mappa connectionId -> stringa base64 del Secret cifrato.
  secrets: Record<string, string>
  // Comandi salvati globali, non legati a una connessione.
  globalCommands: SavedCommand[]
  // Configurazioni dei tunnel (port forwarding).
  tunnels: TunnelConfig[]
}

const store = new Store<Schema>({
  name: 'phosphor-ssh',
  defaults: { connections: [], secrets: {}, globalCommands: [], tunnels: [] }
})

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(value).toString('base64')
  }
  // Fallback se il sistema non offre cifratura (es. Linux senza keyring).
  return 'plain:' + Buffer.from(value, 'utf8').toString('base64')
}

function decrypt(blob: string): string {
  if (blob.startsWith('enc:')) {
    return safeStorage.decryptString(Buffer.from(blob.slice(4), 'base64'))
  }
  if (blob.startsWith('plain:')) {
    return Buffer.from(blob.slice(6), 'base64').toString('utf8')
  }
  return ''
}

function readSecret(connectionId: string): Secret {
  const blob = store.get('secrets')[connectionId]
  if (!blob) return {}
  try {
    return JSON.parse(decrypt(blob)) as Secret
  } catch {
    return {}
  }
}

function writeSecret(connectionId: string, secret: Secret): void {
  const secrets = store.get('secrets')
  secrets[connectionId] = encrypt(JSON.stringify(secret))
  store.set('secrets', secrets)
}

export function listConnections(): Connection[] {
  return store
    .get('connections')
    .slice()
    .sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt))
}

export interface UpsertInput {
  id?: string
  name: string
  description: string
  host: string
  port: number
  username: string
  authMethod: Connection['authMethod']
  keyPath?: string
  startupCommand?: string
  commands: SavedCommand[]
  color: string
  // Segreti opzionali: presenti solo se l'utente li (re)inserisce.
  privateKey?: string
  passphrase?: string
  password?: string
}

export function upsertConnection(input: UpsertInput): Connection {
  const connections = store.get('connections')
  const now = Date.now()
  const existing = input.id ? connections.find((c) => c.id === input.id) : undefined
  const id = existing?.id ?? randomUUID()

  // Gestione segreti incrementale: si tocca solo ciò che arriva.
  const prevSecret = readSecret(id)
  const nextSecret: Secret = { ...prevSecret }
  if (input.privateKey !== undefined) nextSecret.privateKey = input.privateKey || undefined
  if (input.passphrase !== undefined) nextSecret.passphrase = input.passphrase || undefined
  if (input.password !== undefined) nextSecret.password = input.password || undefined
  writeSecret(id, nextSecret)

  const record: Connection = {
    id,
    name: input.name,
    description: input.description,
    host: input.host,
    port: input.port,
    username: input.username,
    authMethod: input.authMethod,
    keyPath: input.keyPath || undefined,
    hasStoredKey: Boolean(nextSecret.privateKey),
    hasStoredPassphrase: Boolean(nextSecret.passphrase),
    hasStoredPassword: Boolean(nextSecret.password),
    startupCommand: input.startupCommand || undefined,
    commands: input.commands,
    color: input.color,
    createdAt: existing?.createdAt ?? now,
    lastUsedAt: existing?.lastUsedAt
  }

  const next = existing
    ? connections.map((c) => (c.id === id ? record : c))
    : [...connections, record]
  store.set('connections', next)
  return record
}

export function deleteConnection(id: string): void {
  store.set(
    'connections',
    store.get('connections').filter((c) => c.id !== id)
  )
  const secrets = store.get('secrets')
  delete secrets[id]
  store.set('secrets', secrets)
}

export function touchConnection(id: string): void {
  const connections = store.get('connections')
  const next = connections.map((c) =>
    c.id === id ? { ...c, lastUsedAt: Date.now() } : c
  )
  store.set('connections', next)
}

export function getSecret(connectionId: string): Secret {
  return readSecret(connectionId)
}

export function listGlobalCommands(): SavedCommand[] {
  return store.get('globalCommands')
}

export function setGlobalCommands(commands: SavedCommand[]): SavedCommand[] {
  store.set('globalCommands', commands)
  return commands
}

export function listTunnels(): TunnelConfig[] {
  return store.get('tunnels')
}

export function upsertTunnel(tunnel: Omit<TunnelConfig, 'id'> & { id?: string }): TunnelConfig {
  const tunnels = store.get('tunnels')
  const id = tunnel.id ?? randomUUID()
  const record: TunnelConfig = { ...tunnel, id }
  const next = tunnels.some((t) => t.id === id)
    ? tunnels.map((t) => (t.id === id ? record : t))
    : [...tunnels, record]
  store.set('tunnels', next)
  return record
}

export function deleteTunnel(id: string): void {
  store.set(
    'tunnels',
    store.get('tunnels').filter((t) => t.id !== id)
  )
}

export function getConnection(id: string): Connection | undefined {
  return store.get('connections').find((c) => c.id === id)
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

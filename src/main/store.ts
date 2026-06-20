import Store from 'electron-store'
import { safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import type {
  AiKeyStatus,
  AiSettings,
  ConfigBundle,
  Connection,
  SavedCommand,
  TunnelConfig
} from '../shared/types'

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
  // Impostazioni dell'assistente AI (non segrete).
  aiSettings: AiSettings
  // Chiavi API per provider, cifrate (providerId -> blob base64).
  aiKeys: Record<string, string>
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  temperature: 0.4,
  maxTokens: 2048,
  systemPromptExtra: '',
  baseUrl: '',
  autoIncludeTerminal: true
}

const store = new Store<Schema>({
  name: 'phosphor-ssh',
  defaults: {
    connections: [],
    secrets: {},
    globalCommands: [],
    tunnels: [],
    aiSettings: DEFAULT_AI_SETTINGS,
    aiKeys: {}
  }
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

// ---- AI Assistant ----

export function getAiSettings(): AiSettings {
  return { ...DEFAULT_AI_SETTINGS, ...store.get('aiSettings') }
}

export function setAiSettings(patch: Partial<AiSettings>): AiSettings {
  const next = { ...getAiSettings(), ...patch }
  store.set('aiSettings', next)
  return next
}

export function setAiKey(provider: string, key: string): void {
  const keys = store.get('aiKeys')
  if (key && key.trim()) keys[provider] = encrypt(key.trim())
  else delete keys[provider]
  store.set('aiKeys', keys)
}

export function getAiKey(provider: string): string | undefined {
  const blob = store.get('aiKeys')[provider]
  if (!blob) return undefined
  const value = decrypt(blob)
  return value || undefined
}

export function clearAiKey(provider: string): void {
  const keys = store.get('aiKeys')
  delete keys[provider]
  store.set('aiKeys', keys)
}

/** Stato (presente/assente) delle chiavi salvate, senza esporre i valori. */
export function aiKeyStatus(): AiKeyStatus {
  const keys = store.get('aiKeys')
  const status: AiKeyStatus = {}
  for (const provider of Object.keys(keys)) status[provider] = Boolean(keys[provider])
  return status
}

// ---- Backup / ripristino ----

/** Esporta tutta la configurazione con i segreti DECIFRATI (da cifrare poi col
 *  backup, mai scritti in chiaro su disco). */
export function exportStore(): ConfigBundle {
  const connections = store.get('connections')
  const secrets: ConfigBundle['secrets'] = {}
  for (const c of connections) {
    const s = readSecret(c.id)
    if (s.privateKey || s.passphrase || s.password) secrets[c.id] = s
  }
  const aiKeys: Record<string, string> = {}
  for (const provider of Object.keys(store.get('aiKeys'))) {
    const k = getAiKey(provider)
    if (k) aiKeys[provider] = k
  }
  return {
    connections,
    secrets,
    globalCommands: store.get('globalCommands'),
    tunnels: store.get('tunnels'),
    aiSettings: getAiSettings(),
    aiKeys
  }
}

/** Ripristina la configurazione, ri-cifrando i segreti con il portachiavi
 *  locale. Sostituisce completamente i dati esistenti. */
export function importStore(bundle: ConfigBundle): void {
  if (Array.isArray(bundle.connections)) store.set('connections', bundle.connections)
  if (bundle.secrets && typeof bundle.secrets === 'object') {
    const out: Record<string, string> = {}
    for (const [id, secret] of Object.entries(bundle.secrets)) {
      out[id] = encrypt(JSON.stringify(secret))
    }
    store.set('secrets', out)
  }
  if (Array.isArray(bundle.globalCommands)) store.set('globalCommands', bundle.globalCommands)
  if (Array.isArray(bundle.tunnels)) store.set('tunnels', bundle.tunnels)
  if (bundle.aiSettings) store.set('aiSettings', { ...DEFAULT_AI_SETTINGS, ...bundle.aiSettings })
  if (bundle.aiKeys && typeof bundle.aiKeys === 'object') {
    const out: Record<string, string> = {}
    for (const [provider, key] of Object.entries(bundle.aiKeys)) {
      if (key) out[provider] = encrypt(key)
    }
    store.set('aiKeys', out)
  }
}

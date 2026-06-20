// Tipi condivisi tra main, preload e renderer.

export type AuthMethod = 'key' | 'password' | 'agent'

export interface SavedCommand {
  id: string
  label: string
  command: string
  /** Se true, invia anche Invio (\r) dopo il comando. */
  runOnSend: boolean
}

export interface Connection {
  id: string
  name: string
  description: string
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  /** Percorso al file .pem se l'utente ne indica uno sul disco. */
  keyPath?: string
  /** True quando la chiave privata è stata importata e cifrata nello store. */
  hasStoredKey: boolean
  /** True quando la passphrase della chiave è stata salvata cifrata. */
  hasStoredPassphrase: boolean
  /** True quando la password è stata salvata cifrata. */
  hasStoredPassword: boolean
  /** Comando eseguito automaticamente all'apertura del primo shell. */
  startupCommand?: string
  commands: SavedCommand[]
  color: string
  createdAt: number
  lastUsedAt?: number
}

/** Payload completo usato per aprire una sessione: include i segreti in chiaro,
 *  presi dallo store cifrato oppure inseriti al volo dall'utente. */
export interface ConnectInput {
  connectionId?: string
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  privateKey?: string
  keyPath?: string
  passphrase?: string
  password?: string
  cols?: number
  rows?: number
}

export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'ready'
  | 'error'
  | 'closed'

export interface SessionMeta {
  sessionId: string
  connectionId?: string
  title: string
  host: string
  username: string
  status: SessionStatus
}

// Eventi push dal main verso il renderer per ogni sessione.
export interface SessionDataEvent {
  sessionId: string
  data: string
}
export interface SessionStatusEvent {
  sessionId: string
  status: SessionStatus
  message?: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

// ---- Monitoraggio server ----

export interface DiskUsage {
  filesystem: string
  mount: string
  sizeKb: number
  usedKb: number
  availKb: number
  percent: number
}

export interface ProcessInfo {
  cpu: number
  mem: number
  command: string
}

export interface MonitorSnapshot {
  at: number
  cpuPercent: number
  cores: number
  load: [number, number, number]
  mem: { totalKb: number; usedKb: number; availableKb: number; percent: number }
  swap: { totalKb: number; usedKb: number; percent: number }
  uptimeSec: number
  disks: DiskUsage[]
  processes: ProcessInfo[]
  host: { os: string; hostname: string }
}

export type MonitorStatus = 'connecting' | 'ready' | 'error'

export interface MonitorStatusEvent {
  monitorId: string
  status: MonitorStatus
  message?: string
}

// ---- Raggiungibilità (Dashboard) ----

export interface PingResult {
  reachable: boolean
  ms: number
}

// ---- SFTP ----

export type SftpEntryType = 'dir' | 'file' | 'link' | 'other'

export interface SftpEntry {
  name: string
  type: SftpEntryType
  size: number
  mtime: number
  /** Permessi in formato ottale leggibile, es. "rwxr-xr-x". */
  mode: string
}

export type SftpStatus = 'connecting' | 'ready' | 'error'

export interface SftpStatusEvent {
  sftpId: string
  status: SftpStatus
  message?: string
}

// ---- Tunnel (port forwarding) ----

export type TunnelType = 'local' | 'remote'

export interface TunnelConfig {
  id: string
  name: string
  connectionId: string
  type: TunnelType
  /** Porta in ascolto (locale per 'local', sul server per 'remote'). */
  srcPort: number
  /** Host di destinazione raggiunto attraverso il tunnel. */
  destHost: string
  destPort: number
}

export type TunnelStatus = 'inactive' | 'starting' | 'active' | 'error'

export interface TunnelStatusEvent {
  tunnelId: string
  status: TunnelStatus
  message?: string
}

// ---- Live Logs ----

export type LogStatus = 'connecting' | 'streaming' | 'error' | 'closed'

export interface LogDataEvent {
  logId: string
  chunk: string
}

export interface LogStatusEvent {
  logId: string
  status: LogStatus
  message?: string
}

// ---- Docker ----

/** Esito del rilevamento di Docker sul server remoto. */
export interface DockerInfo {
  /** Il binario `docker` è presente nel PATH. */
  installed: boolean
  /** L'utente riesce a parlare col daemon (socket raggiungibile, permessi ok). */
  canConnect: boolean
  /** Versione del Docker Engine (server), se interrogabile. */
  serverVersion?: string
  /** Diagnostica leggibile in caso di problema (daemon spento, permessi…). */
  message?: string
}

export type DockerState =
  | 'running'
  | 'exited'
  | 'paused'
  | 'created'
  | 'restarting'
  | 'removing'
  | 'dead'
  | 'unknown'

export interface DockerPort {
  ip?: string
  privatePort: number
  publicPort?: number
  /** tcp | udp */
  protocol: string
}

export interface DockerContainer {
  /** ID completo (64 char) del container. */
  id: string
  name: string
  image: string
  state: DockerState
  /** Stato grezzo, es. "Up 3 hours (healthy)". */
  status: string
  ports: DockerPort[]
  /** Epoch ms della creazione, 0 se non interpretabile. */
  createdAt: number
  command: string
}

export interface DockerStats {
  /** ID (eventualmente abbreviato) restituito da `docker stats`. */
  id: string
  name: string
  cpuPercent: number
  memPercent: number
  memUsedBytes: number
  memLimitBytes: number
  netRxBytes: number
  netTxBytes: number
  blockReadBytes: number
  blockWriteBytes: number
  pids: number
}

export type DockerContainerAction = 'start' | 'stop' | 'restart' | 'remove'

export type DockerEngineStatus = 'connecting' | 'ready' | 'error'

export interface DockerEngineStatusEvent {
  engineId: string
  status: DockerEngineStatus
  message?: string
  /** Tentativo di riconnessione in corso (0 = connessione iniziale). */
  attempt?: number
}

// ---- Shell interattiva dentro un container (docker exec -it) ----

export type DockerExecStatus = 'connecting' | 'ready' | 'closed' | 'error'

export interface DockerExecDataEvent {
  execId: string
  data: string
}

export interface DockerExecStatusEvent {
  execId: string
  status: DockerExecStatus
  message?: string
}

// ---- AI Assistant ----

export type AiProviderId = 'anthropic' | 'openai' | 'google' | 'openai-compatible'

export interface AiModelOption {
  id: string
  label: string
}

export interface AiProviderInfo {
  id: AiProviderId
  label: string
  /** Richiede una API key salvata per funzionare. */
  needsKey: boolean
  /** Permette di indicare un base URL personalizzato (es. Ollama, LM Studio). */
  customBaseUrl: boolean
  /** Suggerimento su dove ottenere la chiave. */
  keyHint?: string
  /** Modelli noti suggeriti; il campo modello resta comunque editabile. */
  models: AiModelOption[]
  /** Indica se i modelli del provider supportano il parametro temperatura. */
  supportsTemperature: boolean
}

export interface AiSettings {
  provider: AiProviderId
  model: string
  temperature: number
  maxTokens: number
  /** Istruzioni extra accodate al system prompt. */
  systemPromptExtra: string
  /** Override del base URL per i provider compatibili OpenAI. */
  baseUrl: string
  /** Allega automaticamente l'output recente del terminale attivo. */
  autoIncludeTerminal: boolean
}

export type AiRole = 'user' | 'assistant'

export interface AiMessage {
  role: AiRole
  content: string
}

/** Contesto della sessione SSH corrente, iniettato nel system prompt. */
export interface AiContext {
  connectionName?: string
  host?: string
  username?: string
  /** Output recente del terminale attivo (già ripulito dagli escape ANSI). */
  terminalTail?: string
  /** Metriche risorse formattate (CPU, RAM, dischi…), se richieste. */
  metrics?: string
}

export interface AiStreamDeltaEvent {
  requestId: string
  text: string
}

export interface AiStreamDoneEvent {
  requestId: string
}

export interface AiStreamErrorEvent {
  requestId: string
  error: string
}

/** Quali provider hanno una chiave salvata (per id provider). */
export type AiKeyStatus = Record<string, boolean>

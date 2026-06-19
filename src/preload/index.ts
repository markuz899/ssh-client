import { contextBridge, ipcRenderer } from 'electron'
import type {
  Connection,
  ConnectInput,
  IpcResult,
  SessionDataEvent,
  SessionStatusEvent,
  MonitorSnapshot,
  MonitorStatusEvent,
  PingResult,
  SftpEntry,
  SftpStatusEvent,
  TunnelConfig,
  TunnelStatusEvent,
  LogDataEvent,
  LogStatusEvent
} from '../shared/types'

interface UpsertInput {
  id?: string
  name: string
  description: string
  host: string
  port: number
  username: string
  authMethod: Connection['authMethod']
  keyPath?: string
  startupCommand?: string
  commands: Connection['commands']
  color: string
  privateKey?: string
  passphrase?: string
  password?: string
}

const api = {
  connections: {
    list: (): Promise<IpcResult<Connection[]>> => ipcRenderer.invoke('connections:list'),
    upsert: (input: UpsertInput): Promise<IpcResult<Connection>> =>
      ipcRenderer.invoke('connections:upsert', input),
    remove: (id: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('connections:delete', id)
  },
  store: {
    encryptionAvailable: (): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('store:encryptionAvailable')
  },
  globalCommands: {
    list: (): Promise<IpcResult<Connection['commands']>> =>
      ipcRenderer.invoke('globalCommands:list'),
    set: (commands: Connection['commands']): Promise<IpcResult<Connection['commands']>> =>
      ipcRenderer.invoke('globalCommands:set', commands)
  },
  dialog: {
    pickKey: (): Promise<IpcResult<{ path: string; content: string } | null>> =>
      ipcRenderer.invoke('dialog:pickKey')
  },
  session: {
    open: (input: ConnectInput): Promise<IpcResult<{ sessionId: string }>> =>
      ipcRenderer.invoke('session:open', input),
    write: (sessionId: string, data: string): void =>
      ipcRenderer.send('session:write', { sessionId, data }),
    resize: (sessionId: string, cols: number, rows: number): void =>
      ipcRenderer.send('session:resize', { sessionId, cols, rows }),
    close: (sessionId: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('session:close', sessionId),
    onData: (cb: (e: SessionDataEvent) => void): (() => void) => {
      const listener = (_: unknown, e: SessionDataEvent): void => cb(e)
      ipcRenderer.on('session:data', listener)
      return () => ipcRenderer.removeListener('session:data', listener)
    },
    onStatus: (cb: (e: SessionStatusEvent) => void): (() => void) => {
      const listener = (_: unknown, e: SessionStatusEvent): void => cb(e)
      ipcRenderer.on('session:status', listener)
      return () => ipcRenderer.removeListener('session:status', listener)
    }
  },
  monitor: {
    open: (input: ConnectInput): Promise<IpcResult<{ monitorId: string }>> =>
      ipcRenderer.invoke('monitor:open', input),
    sample: (monitorId: string): Promise<IpcResult<MonitorSnapshot>> =>
      ipcRenderer.invoke('monitor:sample', monitorId),
    close: (monitorId: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('monitor:close', monitorId),
    onStatus: (cb: (e: MonitorStatusEvent) => void): (() => void) => {
      const listener = (_: unknown, e: MonitorStatusEvent): void => cb(e)
      ipcRenderer.on('monitor:status', listener)
      return () => ipcRenderer.removeListener('monitor:status', listener)
    }
  },
  net: {
    ping: (host: string, port: number): Promise<IpcResult<PingResult>> =>
      ipcRenderer.invoke('net:ping', { host, port })
  },
  sftp: {
    open: (input: ConnectInput): Promise<IpcResult<{ sftpId: string }>> =>
      ipcRenderer.invoke('sftp:open', input),
    home: (id: string): Promise<IpcResult<string>> => ipcRenderer.invoke('sftp:home', id),
    list: (id: string, path: string): Promise<IpcResult<SftpEntry[]>> =>
      ipcRenderer.invoke('sftp:list', { id, path }),
    download: (id: string, remotePath: string, name: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('sftp:download', { id, remotePath, name }),
    uploadDialog: (id: string, remoteDir: string): Promise<IpcResult<number>> =>
      ipcRenderer.invoke('sftp:uploadDialog', { id, remoteDir }),
    uploadPaths: (id: string, remoteDir: string, paths: string[]): Promise<IpcResult<number>> =>
      ipcRenderer.invoke('sftp:uploadPaths', { id, remoteDir, paths }),
    mkdir: (id: string, path: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('sftp:mkdir', { id, path }),
    remove: (id: string, path: string, isDir: boolean): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('sftp:remove', { id, path, isDir }),
    rename: (id: string, from: string, to: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('sftp:rename', { id, from, to }),
    readFile: (id: string, path: string): Promise<IpcResult<string>> =>
      ipcRenderer.invoke('sftp:readFile', { id, path }),
    writeFile: (id: string, path: string, content: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('sftp:writeFile', { id, path, content }),
    close: (id: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke('sftp:close', id),
    onStatus: (cb: (e: SftpStatusEvent) => void): (() => void) => {
      const listener = (_: unknown, e: SftpStatusEvent): void => cb(e)
      ipcRenderer.on('sftp:status', listener)
      return () => ipcRenderer.removeListener('sftp:status', listener)
    }
  },
  tunnels: {
    list: (): Promise<IpcResult<(TunnelConfig & { active: boolean })[]>> =>
      ipcRenderer.invoke('tunnels:list'),
    upsert: (t: Omit<TunnelConfig, 'id'> & { id?: string }): Promise<IpcResult<TunnelConfig>> =>
      ipcRenderer.invoke('tunnels:upsert', t),
    remove: (id: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke('tunnels:delete', id),
    start: (id: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke('tunnel:start', id),
    stop: (id: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke('tunnel:stop', id),
    onStatus: (cb: (e: TunnelStatusEvent) => void): (() => void) => {
      const listener = (_: unknown, e: TunnelStatusEvent): void => cb(e)
      ipcRenderer.on('tunnel:status', listener)
      return () => ipcRenderer.removeListener('tunnel:status', listener)
    }
  },
  logs: {
    start: (input: ConnectInput, command: string): Promise<IpcResult<{ logId: string }>> =>
      ipcRenderer.invoke('logs:start', { input, command }),
    stop: (logId: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke('logs:stop', logId),
    export: (content: string, defaultName: string): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke('logs:export', { content, defaultName }),
    onData: (cb: (e: LogDataEvent) => void): (() => void) => {
      const listener = (_: unknown, e: LogDataEvent): void => cb(e)
      ipcRenderer.on('logs:data', listener)
      return () => ipcRenderer.removeListener('logs:data', listener)
    },
    onStatus: (cb: (e: LogStatusEvent) => void): (() => void) => {
      const listener = (_: unknown, e: LogStatusEvent): void => cb(e)
      ipcRenderer.on('logs:status', listener)
      return () => ipcRenderer.removeListener('logs:status', listener)
    }
  }
}

contextBridge.exposeInMainWorld('phosphor', api)

export type PhosphorApi = typeof api

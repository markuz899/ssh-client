import { ipcMain, dialog, BrowserWindow, type IpcMainEvent } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import type { IpcResult } from '../shared/types'
import { basename } from 'path'
import {
  listConnections,
  upsertConnection,
  deleteConnection,
  touchConnection,
  getSecret,
  getConnection,
  encryptionAvailable,
  listGlobalCommands,
  setGlobalCommands,
  listTunnels,
  upsertTunnel,
  deleteTunnel,
  getAiSettings,
  setAiSettings,
  setAiKey,
  clearAiKey,
  aiKeyStatus,
  type UpsertInput
} from './store'
import { PROVIDERS } from './aiProviders'
import { sendChat, cancelChat, testProvider } from './ai'
import type { AiContext, AiMessage, AiSettings } from '../shared/types'
import type { Connection, ConnectInput, SavedCommand, TunnelConfig } from '../shared/types'
import { createSession, writeToSession, resizeSession, closeSession } from './ssh'
import { openMonitor, sampleMonitor, closeMonitor } from './monitor'
import { tcpPing } from './probe'
import {
  openSftp,
  homeDir,
  listDir,
  downloadFile,
  uploadFile,
  makeDir,
  removeEntry,
  renameEntry,
  readFileText,
  writeFileText,
  closeSftp
} from './sftp'
import { startTunnel, stopTunnel, isActive } from './tunnels'
import { startLog, stopLog } from './logs'
import {
  openDocker,
  detectDocker,
  listContainers,
  statsContainers,
  containerAction,
  closeDocker,
  openExec,
  writeExec,
  resizeExec,
  closeExec
} from './docker'
import type { DockerContainerAction } from '../shared/types'

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

// Costruisce un ConnectInput dai dati di una connessione salvata.
function connectInputFromConnection(c: Connection): ConnectInput {
  return {
    connectionId: c.id,
    host: c.host,
    port: c.port,
    username: c.username,
    authMethod: c.authMethod,
    keyPath: c.keyPath
  }
}

// Completa il ConnectInput con i segreti salvati (cifrati) se non già forniti.
function withStoredSecrets(input: ConnectInput): ConnectInput {
  const merged: ConnectInput = { ...input }
  if (input.connectionId) {
    const secret = getSecret(input.connectionId)
    if (merged.privateKey === undefined) merged.privateKey = secret.privateKey
    if (merged.passphrase === undefined) merged.passphrase = secret.passphrase
    if (merged.password === undefined) merged.password = secret.password
  }
  return merged
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // ---- Connessioni (CRUD) ----
  ipcMain.handle('connections:list', () => ok(listConnections()))

  ipcMain.handle('connections:upsert', (_e, input: UpsertInput) => {
    try {
      return ok(upsertConnection(input))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('connections:delete', (_e, id: string) => {
    deleteConnection(id)
    return ok(true)
  })

  ipcMain.handle('store:encryptionAvailable', () => ok(encryptionAvailable()))

  // ---- Comandi globali ----
  ipcMain.handle('globalCommands:list', () => ok(listGlobalCommands()))
  ipcMain.handle('globalCommands:set', (_e, commands: SavedCommand[]) =>
    ok(setGlobalCommands(commands))
  )

  // ---- Selezione file chiave .pem ----
  ipcMain.handle('dialog:pickKey', async () => {
    const win = getWindow()
    if (!win) return fail('Finestra non disponibile')
    const res = await dialog.showOpenDialog(win, {
      title: 'Seleziona la chiave privata',
      properties: ['openFile'],
      filters: [
        { name: 'Chiavi', extensions: ['pem', 'key', 'ppk', 'rsa', 'ed25519'] },
        { name: 'Tutti i file', extensions: ['*'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) return ok(null)
    const path = res.filePaths[0]
    const content = await readFile(path, 'utf8')
    return ok({ path, content })
  })

  // ---- Sessioni terminale ----
  ipcMain.handle('session:open', (_e, input: ConnectInput) => {
    try {
      // Recupera i segreti salvati se non passati esplicitamente.
      const merged = withStoredSecrets(input)
      if (input.connectionId) touchConnection(input.connectionId)
      const sessionId = createSession(merged, (event) => {
        const win = getWindow()
        if (!win || win.isDestroyed()) return
        if (event.type === 'data') {
          win.webContents.send('session:data', {
            sessionId: event.sessionId,
            data: event.data
          })
        } else {
          win.webContents.send('session:status', {
            sessionId: event.sessionId,
            status: event.status,
            message: event.message
          })
        }
      })
      return ok({ sessionId })
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.on('session:write', (_e: IpcMainEvent, p: { sessionId: string; data: string }) => {
    writeToSession(p.sessionId, p.data)
  })

  ipcMain.on(
    'session:resize',
    (_e: IpcMainEvent, p: { sessionId: string; cols: number; rows: number }) => {
      resizeSession(p.sessionId, p.cols, p.rows)
    }
  )

  ipcMain.handle('session:close', (_e, sessionId: string) => {
    closeSession(sessionId)
    return ok(true)
  })

  // ---- Monitoraggio ----
  ipcMain.handle('monitor:open', (_e, input: ConnectInput) => {
    try {
      const merged = withStoredSecrets(input)
      const monitorId = openMonitor(merged, (id, status, message) => {
        const win = getWindow()
        if (!win || win.isDestroyed()) return
        win.webContents.send('monitor:status', { monitorId: id, status, message })
      })
      return ok({ monitorId })
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('monitor:sample', async (_e, monitorId: string) => {
    try {
      return ok(await sampleMonitor(monitorId))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('monitor:close', (_e, monitorId: string) => {
    closeMonitor(monitorId)
    return ok(true)
  })

  // ---- Raggiungibilità (Dashboard) ----
  ipcMain.handle('net:ping', async (_e, p: { host: string; port: number }) => {
    try {
      return ok(await tcpPing(p.host, p.port))
    } catch (e) {
      return fail(e)
    }
  })

  // ---- SFTP ----
  ipcMain.handle('sftp:open', (_e, input: ConnectInput) => {
    try {
      const sftpId = openSftp(withStoredSecrets(input), (id, status, message) => {
        const win = getWindow()
        if (!win || win.isDestroyed()) return
        win.webContents.send('sftp:status', { sftpId: id, status, message })
      })
      return ok({ sftpId })
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:home', async (_e, id: string) => {
    try {
      return ok(await homeDir(id))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:list', async (_e, p: { id: string; path: string }) => {
    try {
      return ok(await listDir(p.id, p.path))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:download', async (_e, p: { id: string; remotePath: string; name: string }) => {
    try {
      const win = getWindow()
      if (!win) return fail('Finestra non disponibile')
      const res = await dialog.showSaveDialog(win, { title: 'Salva con nome', defaultPath: p.name })
      if (res.canceled || !res.filePath) return ok(false)
      await downloadFile(p.id, p.remotePath, res.filePath)
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:uploadDialog', async (_e, p: { id: string; remoteDir: string }) => {
    try {
      const win = getWindow()
      if (!win) return fail('Finestra non disponibile')
      const res = await dialog.showOpenDialog(win, {
        title: 'Carica file',
        properties: ['openFile', 'multiSelections']
      })
      if (res.canceled || res.filePaths.length === 0) return ok(0)
      for (const local of res.filePaths) {
        const remote = `${p.remoteDir.replace(/\/$/, '')}/${basename(local)}`
        await uploadFile(p.id, local, remote)
      }
      return ok(res.filePaths.length)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:uploadPaths', async (_e, p: { id: string; remoteDir: string; paths: string[] }) => {
    try {
      for (const local of p.paths) {
        const remote = `${p.remoteDir.replace(/\/$/, '')}/${basename(local)}`
        await uploadFile(p.id, local, remote)
      }
      return ok(p.paths.length)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:mkdir', async (_e, p: { id: string; path: string }) => {
    try {
      await makeDir(p.id, p.path)
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:remove', async (_e, p: { id: string; path: string; isDir: boolean }) => {
    try {
      await removeEntry(p.id, p.path, p.isDir)
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:rename', async (_e, p: { id: string; from: string; to: string }) => {
    try {
      await renameEntry(p.id, p.from, p.to)
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:readFile', async (_e, p: { id: string; path: string }) => {
    try {
      return ok(await readFileText(p.id, p.path))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:writeFile', async (_e, p: { id: string; path: string; content: string }) => {
    try {
      await writeFileText(p.id, p.path, p.content)
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('sftp:close', (_e, id: string) => {
    closeSftp(id)
    return ok(true)
  })

  // ---- Tunnel ----
  ipcMain.handle('tunnels:list', () =>
    ok(listTunnels().map((t) => ({ ...t, active: isActive(t.id) })))
  )

  ipcMain.handle('tunnels:upsert', (_e, t: Omit<TunnelConfig, 'id'> & { id?: string }) => {
    try {
      return ok(upsertTunnel(t))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('tunnels:delete', (_e, id: string) => {
    stopTunnel(id)
    deleteTunnel(id)
    return ok(true)
  })

  ipcMain.handle('tunnel:start', (_e, id: string) => {
    const config = listTunnels().find((t) => t.id === id)
    if (!config) return fail('Tunnel non trovato')
    const conn = getConnection(config.connectionId)
    if (!conn) return fail('Connessione associata non trovata')
    const input = withStoredSecrets(connectInputFromConnection(conn))
    startTunnel(config, input, (tid, status, message) => {
      const win = getWindow()
      if (!win || win.isDestroyed()) return
      win.webContents.send('tunnel:status', { tunnelId: tid, status, message })
    })
    return ok(true)
  })

  ipcMain.handle('tunnel:stop', (_e, id: string) => {
    stopTunnel(id)
    return ok(true)
  })

  // ---- Live Logs ----
  ipcMain.handle('logs:start', (_e, p: { input: ConnectInput; command: string }) => {
    try {
      const logId = startLog(
        withStoredSecrets(p.input),
        p.command,
        (id, chunk) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) win.webContents.send('logs:data', { logId: id, chunk })
        },
        (id, status, message) => {
          const win = getWindow()
          if (win && !win.isDestroyed())
            win.webContents.send('logs:status', { logId: id, status, message })
        }
      )
      return ok({ logId })
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('logs:stop', (_e, logId: string) => {
    stopLog(logId)
    return ok(true)
  })

  ipcMain.handle('logs:export', async (_e, p: { content: string; defaultName: string }) => {
    try {
      const win = getWindow()
      if (!win) return fail('Finestra non disponibile')
      const res = await dialog.showSaveDialog(win, {
        title: 'Esporta log',
        defaultPath: p.defaultName,
        filters: [{ name: 'Log', extensions: ['log', 'txt'] }]
      })
      if (res.canceled || !res.filePath) return ok(false)
      await writeFile(res.filePath, p.content, 'utf8')
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })

  // ---- Docker ----
  ipcMain.handle('docker:open', (_e, input: ConnectInput) => {
    try {
      const engineId = openDocker(withStoredSecrets(input), (id, status, message, attempt) => {
        const win = getWindow()
        if (!win || win.isDestroyed()) return
        win.webContents.send('docker:status', { engineId: id, status, message, attempt })
      })
      return ok({ engineId })
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('docker:detect', async (_e, engineId: string) => {
    try {
      return ok(await detectDocker(engineId))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('docker:list', async (_e, engineId: string) => {
    try {
      return ok(await listContainers(engineId))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('docker:stats', async (_e, engineId: string) => {
    try {
      return ok(await statsContainers(engineId))
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(
    'docker:action',
    async (_e, p: { engineId: string; action: DockerContainerAction; containerId: string }) => {
      try {
        await containerAction(p.engineId, p.action, p.containerId)
        return ok(true)
      } catch (e) {
        return fail(e)
      }
    }
  )

  ipcMain.handle('docker:close', (_e, engineId: string) => {
    closeDocker(engineId)
    return ok(true)
  })

  // ---- Docker exec (shell interattiva) ----
  ipcMain.handle('docker:exec:open', (_e, p: { input: ConnectInput; containerId: string }) => {
    try {
      const execId = openExec(
        withStoredSecrets(p.input),
        p.containerId,
        (id, data) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) win.webContents.send('docker:exec:data', { execId: id, data })
        },
        (id, status, message) => {
          const win = getWindow()
          if (win && !win.isDestroyed())
            win.webContents.send('docker:exec:status', { execId: id, status, message })
        }
      )
      return ok({ execId })
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.on('docker:exec:write', (_e: IpcMainEvent, p: { execId: string; data: string }) => {
    writeExec(p.execId, p.data)
  })

  ipcMain.on(
    'docker:exec:resize',
    (_e: IpcMainEvent, p: { execId: string; cols: number; rows: number }) => {
      resizeExec(p.execId, p.cols, p.rows)
    }
  )

  ipcMain.handle('docker:exec:close', (_e, execId: string) => {
    closeExec(execId)
    return ok(true)
  })

  // ---- AI Assistant ----
  ipcMain.handle('ai:catalog', () => ok(PROVIDERS))
  ipcMain.handle('ai:settings:get', () => ok(getAiSettings()))
  ipcMain.handle('ai:settings:set', (_e, patch: Partial<AiSettings>) => ok(setAiSettings(patch)))
  ipcMain.handle('ai:keyStatus', () => ok(aiKeyStatus()))

  ipcMain.handle('ai:key:set', (_e, p: { provider: string; key: string }) => {
    setAiKey(p.provider, p.key)
    return ok(aiKeyStatus())
  })

  ipcMain.handle('ai:key:clear', (_e, provider: string) => {
    clearAiKey(provider)
    return ok(aiKeyStatus())
  })

  ipcMain.handle('ai:test', async () => {
    try {
      await testProvider()
      return ok(true)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle(
    'ai:send',
    (_e, p: { requestId: string; messages: AiMessage[]; context?: AiContext }) => {
      const send = (channel: string, payload: unknown): void => {
        const win = getWindow()
        if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
      }
      // Fire-and-forget: lo streaming prosegue via eventi; gli errori sono
      // emessi sul canale 'ai:error'.
      void sendChat(
        p.requestId,
        p.messages,
        p.context,
        (requestId, text) => send('ai:delta', { requestId, text }),
        (requestId) => send('ai:done', { requestId }),
        (requestId, error) => send('ai:error', { requestId, error })
      )
      return ok(true)
    }
  )

  ipcMain.handle('ai:cancel', (_e, requestId: string) => {
    cancelChat(requestId)
    return ok(true)
  })
}

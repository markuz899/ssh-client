import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { closeAll } from './ssh'
import { closeAllMonitors } from './monitor'
import { closeAllSftp } from './sftp'
import { closeAllTunnels } from './tunnels'
import { closeAllLogs } from './logs'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: '#060A12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite inietta ELECTRON_RENDERER_URL in sviluppo.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc(() => mainWindow)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function shutdownAll(): void {
  closeAll()
  closeAllMonitors()
  closeAllSftp()
  closeAllTunnels()
  closeAllLogs()
}

app.on('window-all-closed', () => {
  shutdownAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => shutdownAll())

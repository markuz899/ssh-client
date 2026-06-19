import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, VIEWS_WITH_SIDEBAR } from './lib/store'
import { useSettings, hexToRgb, rgbString } from './lib/settings'
import { initSessionBus, onStatus } from './lib/sessionBus'
import { onAction, matchAndDispatch, type ActionId } from './lib/shortcuts'
import SquaresBg from './components/ui/SquaresBg'
import TitleBar from './components/TitleBar'
import NavRail from './components/NavRail'
import Sidebar from './components/Sidebar'
import Workspace from './components/Terminal/Workspace'
import MonitorView from './components/Monitor/MonitorView'
import DashboardView from './components/Dashboard/DashboardView'
import SftpView from './components/Sftp/SftpView'
import TunnelsView from './components/Tunnels/TunnelsView'
import ConnectionForm from './components/ConnectionForm'
import SettingsPanel from './components/SettingsPanel'

export default function App(): JSX.Element {
  const { editor, view, sidebarCollapsed, loadConnections, loadGlobalCommands, setEncryption, updatePane } =
    useStore()
  const accentHex = useSettings((s) => s.accent)
  const settingsOpen = useSettings((s) => s.open)
  const accentRgb = rgbString(hexToRgb(accentHex))
  // Tiene traccia delle sessioni a cui è già stato inviato lo startup command.
  const startupSent = useRef<Set<string>>(new Set())

  useEffect(() => {
    const teardown = initSessionBus()
    loadConnections()
    loadGlobalCommands()
    window.phosphor.store.encryptionAvailable().then((r) => {
      if (r.ok) setEncryption(r.data)
    })

    const offStatus = onStatus((e) => {
      const { panes, connections } = useStore.getState()
      const pane = Object.values(panes).find((p) => p.sessionId === e.sessionId)
      if (!pane) return
      updatePane(pane.id, { status: e.status, errorMessage: e.message })

      // Invia il comando d'avvio una sola volta, quando la shell è pronta.
      if (e.status === 'ready' && !startupSent.current.has(e.sessionId)) {
        startupSent.current.add(e.sessionId)
        const conn = connections.find((c) => c.id === pane.connectionId)
        if (conn?.startupCommand) {
          window.phosphor.session.write(e.sessionId, conn.startupCommand + '\r')
        }
      }
    })

    return () => {
      offStatus()
      teardown()
    }
  }, [])

  // Scorciatoie da tastiera: dispatch globale + esecuzione delle azioni.
  useEffect(() => {
    const run = (id: ActionId): void => {
      const st = useStore.getState()
      switch (id) {
        case 'searchTerminal':
          if (st.tabs.length > 0) {
            st.setView('terminal')
            st.setSearchOpen(true)
          }
          break
        case 'toggleSidebar':
          st.toggleSidebar()
          break
        case 'openSettings':
          useSettings.getState().setOpen(true)
          break
        case 'newConnection':
          st.openEditor({ mode: 'new' })
          break
        case 'closeTab':
          st.closeActiveTab()
          break
        case 'duplicateTab':
          if (st.activeTabId) st.duplicateTab(st.activeTabId)
          break
        case 'splitRight':
        case 'splitDown': {
          const tab = st.tabs.find((t) => t.id === st.activeTabId)
          if (tab) st.splitPane(tab.id, tab.activePaneId, id === 'splitRight' ? 'row' : 'col')
          break
        }
        case 'closePane': {
          const tab = st.tabs.find((t) => t.id === st.activeTabId)
          if (tab) st.closePane(tab.id, tab.activePaneId)
          break
        }
        case 'nextTab':
          st.cycleTab(1)
          break
        case 'prevTab':
          st.cycleTab(-1)
          break
        case 'viewTerminal':
          st.setView('terminal')
          break
        case 'viewMonitor':
          st.setView('monitor')
          break
      }
    }
    const offAction = onAction(run)

    const onKeyDown = (e: KeyboardEvent): void => {
      // I terminali gestiscono le proprie scorciatoie via xterm; qui evitiamo
      // di intercettare mentre si digita in un campo di testo.
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return
      if (matchAndDispatch(e, useSettings.getState().shortcuts)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      offAction()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-void">
      {/* Sfondo a reticolo animato dietro tutto. */}
      <div className="pointer-events-none absolute inset-0 grid-backdrop">
        <SquaresBg accent={accentRgb} />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <TitleBar />
        <div className="relative flex flex-1 overflow-hidden">
          <NavRail />
          {/* Pannello sidebar comprimibile, solo nelle viste che scelgono una
              connessione (la NavRail resta sempre visibile). */}
          {VIEWS_WITH_SIDEBAR.includes(view) && (
            <motion.div
              className="overflow-hidden"
              animate={{ width: sidebarCollapsed ? 0 : 300 }}
              initial={false}
              transition={{ type: 'spring', stiffness: 320, damping: 36 }}
            >
              <Sidebar />
            </motion.div>
          )}
          <main className="relative flex flex-1 flex-col overflow-hidden">
            {/* Il Workspace resta montato anche nelle altre viste per non
                interrompere le sessioni SSH attive. */}
            <div className="flex flex-1 flex-col overflow-hidden" style={{ display: view === 'terminal' ? 'flex' : 'none' }}>
              <Workspace />
            </div>
            {view === 'dashboard' && <DashboardView />}
            {view === 'monitor' && <MonitorView />}
            {view === 'sftp' && <SftpView />}
            {view === 'tunnels' && <TunnelsView />}
            <AnimatePresence>
              {editor.mode !== 'closed' && <ConnectionForm key="editor" />}
            </AnimatePresence>
            <AnimatePresence>
              {settingsOpen && <SettingsPanel key="settings" />}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  )
}

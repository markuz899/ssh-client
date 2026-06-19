import { motion, AnimatePresence } from 'framer-motion'
import { useStore, type Tab } from '../../lib/store'
import TabBar from './TabBar'
import TerminalView from './TerminalView'
import ConnectingOverlay from './ConnectingOverlay'
import CommandRail from './CommandRail'
import TerminalSearch from './TerminalSearch'

export default function Workspace(): JSX.Element {
  const { tabs, activeTabId, connections, startSession, removeTab, searchOpen } = useStore()

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeConnection = connections.find((c) => c.id === activeTab?.connectionId)

  const retry = (tab: Tab): void => {
    if (!tab.connectionId) return
    const conn = connections.find((c) => c.id === tab.connectionId)
    if (!conn) return
    removeTab(tab.id)
    startSession(
      {
        connectionId: conn.id,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        authMethod: conn.authMethod,
        keyPath: conn.keyPath
      },
      { connectionId: conn.id, title: conn.name, host: conn.host, username: conn.username }
    )
  }

  if (tabs.length === 0) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-line bg-elev/60 font-mono text-2xl text-phosphor text-glow">
            ⌁
          </div>
          <h2 className="mb-2 font-display text-xl text-ink">Nessuna sessione aperta</h2>
          <p className="max-w-sm font-mono text-[13px] leading-relaxed text-ink-dim">
            Scegli una connessione dalla colonna a sinistra e premi{' '}
            <span className="text-phosphor">collega</span>, oppure creane una nuova con{' '}
            <span className="text-phosphor">+</span>.
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TabBar />
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence>
          {searchOpen && activeTab && <TerminalSearch key={activeTab.id} tabId={activeTab.id} />}
        </AnimatePresence>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className="absolute inset-0"
              style={{ visibility: isActive ? 'visible' : 'hidden', zIndex: isActive ? 1 : 0 }}
            >
              {tab.sessionId && <TerminalView tab={tab} active={isActive} />}
              {(tab.status === 'connecting' ||
                tab.status === 'authenticating' ||
                tab.status === 'error') && (
                <ConnectingOverlay
                  tab={tab}
                  onRetry={() => retry(tab)}
                  onClose={() => removeTab(tab.id)}
                />
              )}
            </div>
          )
        })}
      </div>
      <CommandRail
        connection={activeConnection}
        disabled={!activeTab || activeTab.status !== 'ready'}
      />
    </div>
  )
}

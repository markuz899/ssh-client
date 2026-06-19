import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../lib/store'
import { collectPaneIds } from '../../lib/layout'
import TabBar from './TabBar'
import LayoutView from './SplitLayout'
import CommandRail from './CommandRail'
import TerminalSearch from './TerminalSearch'

export default function Workspace(): JSX.Element {
  const { tabs, activeTabId, panes, connections, searchOpen } = useStore()

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activePane = activeTab ? panes[activeTab.activePaneId] : undefined
  const activeConnection = connections.find((c) => c.id === activePane?.connectionId)

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
            <span className="text-phosphor">collega</span>. Poi dividi il pannello con i
            controlli in basso a destra di ogni terminale.
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
          {searchOpen && activePane && (
            <TerminalSearch key={activePane.id} paneId={activePane.id} />
          )}
        </AnimatePresence>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const multi = collectPaneIds(tab.layout).length > 1
          return (
            <div
              key={tab.id}
              className="absolute inset-0"
              style={{ visibility: isActive ? 'visible' : 'hidden', zIndex: isActive ? 1 : 0 }}
            >
              <LayoutView node={tab.layout} tab={tab} multi={multi} />
            </div>
          )
        })}
      </div>
      <CommandRail
        connection={activeConnection}
        disabled={!activePane || activePane.status !== 'ready'}
      />
    </div>
  )
}

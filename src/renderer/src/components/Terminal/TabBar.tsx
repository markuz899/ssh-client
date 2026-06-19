import { Reorder, motion } from 'framer-motion'
import { useStore } from '../../lib/store'
import type { SessionStatus } from '@shared/types'

/** LED di stato colorato col colore della connessione. */
function Led({ color, status }: { color: string; status: SessionStatus }): JSX.Element {
  const busy = status === 'connecting' || status === 'authenticating'
  const error = status === 'error'
  const closed = status === 'closed'
  return (
    <motion.span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{
        background: color,
        opacity: closed ? 0.4 : 1,
        boxShadow:
          status === 'ready'
            ? `0 0 8px ${color}`
            : error
              ? '0 0 0 2px rgb(var(--c-danger) / 0.7)'
              : 'none'
      }}
      animate={busy ? { opacity: [1, 0.3, 1] } : { opacity: closed ? 0.4 : 1 }}
      transition={busy ? { repeat: Infinity, duration: 1.1 } : { duration: 0.2 }}
    />
  )
}

export default function TabBar(): JSX.Element {
  const { tabs, activeTabId, connections, setActiveTab, removeTab, setTabsOrder, duplicateTab } =
    useStore()

  return (
    <div className="drag flex items-stretch gap-1.5 border-b border-line bg-panel/60 px-2 pt-2.5 pb-0">
      <Reorder.Group
        as="div"
        axis="x"
        values={tabs}
        onReorder={setTabsOrder}
        className="flex flex-1 items-stretch gap-1.5 overflow-x-auto pb-2"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const color = connections.find((c) => c.id === tab.connectionId)?.color ?? '#5EF6FF'
          return (
            <Reorder.Item
              key={tab.id}
              value={tab}
              as="div"
              onClick={() => setActiveTab(tab.id)}
              whileDrag={{ scale: 1.03, cursor: 'grabbing' }}
              className={`no-drag group relative flex min-w-[168px] max-w-[230px] cursor-pointer items-center gap-2 rounded-t-md border border-b-0 px-3 py-2 transition-colors ${
                isActive
                  ? 'border-line bg-elev text-ink'
                  : 'border-transparent bg-transparent text-ink-dim hover:bg-elev/50'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-x-0 -bottom-px h-px bg-phosphor shadow-[0_0_8px_rgb(var(--c-accent))]"
                />
              )}
              <Led color={color} status={tab.status} />
              <span className="flex-1 truncate font-mono text-xs">{tab.title}</span>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  duplicateTab(tab.id)
                }}
                title="Nuovo tab sulla stessa connessione"
                className="hidden text-ink-faint transition hover:text-phosphor group-hover:block"
              >
                ⧉
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  removeTab(tab.id)
                }}
                title="Chiudi"
                className="text-ink-faint transition hover:text-danger"
              >
                ×
              </button>
            </Reorder.Item>
          )
        })}
      </Reorder.Group>
    </div>
  )
}

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../lib/store'
import { collectPaneIds } from '../../lib/layout'
import { TAB_DND_TYPE } from '../../lib/dnd'
import LayoutsMenu from './LayoutsMenu'
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
  const {
    tabs,
    activeTabId,
    panes,
    connections,
    setActiveTab,
    removeTab,
    setTabsOrder,
    duplicateTab,
    setDraggingTab
  } = useStore()
  const [dropTarget, setDropTarget] = useState<{ tabId: string; side: 'before' | 'after' } | null>(
    null
  )

  const reorder = (sourceId: string, targetId: string, side: 'before' | 'after'): void => {
    if (sourceId === targetId) return
    const order = tabs.filter((t) => t.id !== sourceId).map((t) => t.id)
    const src = tabs.find((t) => t.id === sourceId)
    if (!src) return
    let idx = order.indexOf(targetId)
    if (idx === -1) idx = order.length
    if (side === 'after') idx += 1
    order.splice(idx, 0, sourceId)
    setTabsOrder(order.map((id) => tabs.find((t) => t.id === id)!))
  }

  return (
    <div className="drag flex items-stretch gap-1.5 border-b border-line bg-panel/60 px-2 pt-2.5 pb-0">
      <div className="flex flex-1 items-stretch gap-1.5 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const activePane = panes[tab.activePaneId]
          const color = connections.find((c) => c.id === activePane?.connectionId)?.color ?? '#5EF6FF'
          const paneCount = collectPaneIds(tab.layout).length
          const indicator = dropTarget?.tabId === tab.id ? dropTarget.side : null
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', tab.id)
                e.dataTransfer.setData(TAB_DND_TYPE, tab.id)
                e.dataTransfer.effectAllowed = 'move'
                setDraggingTab(tab.id)
              }}
              onDragEnd={() => {
                setDraggingTab(undefined)
                setDropTarget(null)
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(TAB_DND_TYPE)) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const side = e.clientX < r.left + r.width / 2 ? 'before' : 'after'
                setDropTarget({ tabId: tab.id, side })
              }}
              onDrop={(e) => {
                const src = e.dataTransfer.getData('text/plain')
                if (src && dropTarget) reorder(src, tab.id, dropTarget.side)
                setDropTarget(null)
                setDraggingTab(undefined)
              }}
              onClick={() => setActiveTab(tab.id)}
              className={`no-drag group relative flex min-w-[168px] max-w-[230px] cursor-pointer items-center gap-2 rounded-t-md border border-b-0 px-3 py-2 transition-colors ${
                isActive
                  ? 'border-line bg-elev text-ink'
                  : 'border-transparent bg-transparent text-ink-dim hover:bg-elev/50'
              }`}
            >
              {indicator && (
                <span
                  className={`absolute top-1 bottom-1 w-0.5 rounded bg-phosphor shadow-[0_0_8px_rgb(var(--c-accent))] ${
                    indicator === 'before' ? '-left-1' : '-right-1'
                  }`}
                />
              )}
              {isActive && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-x-0 -bottom-px h-px bg-phosphor shadow-[0_0_8px_rgb(var(--c-accent))]"
                />
              )}
              <Led color={color} status={activePane?.status ?? 'closed'} />
              <span className="flex-1 truncate font-mono text-xs">{tab.title}</span>
              {paneCount > 1 && (
                <span className="shrink-0 rounded border border-line px-1 font-mono text-[9px] text-ink-dim">
                  ⊞{paneCount}
                </span>
              )}
              <button
                draggable={false}
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
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation()
                  removeTab(tab.id)
                }}
                title="Chiudi"
                className="text-ink-faint transition hover:text-danger"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      <div className="no-drag flex items-center pb-2 pl-1">
        <LayoutsMenu />
      </div>
    </div>
  )
}

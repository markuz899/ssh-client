import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Conversation } from '../../lib/aiChat'

export default function ConversationList({
  conversations,
  activeId,
  streamingIds,
  onSelect,
  onNew,
  onDelete,
  onRename
}: {
  conversations: Conversation[]
  activeId: string | null
  streamingIds: Set<string>
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}): JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startEdit = (c: Conversation): void => {
    setEditing(c.id)
    setDraft(c.title || 'Nuova chat')
  }
  const commit = (): void => {
    if (editing && draft.trim()) onRename(editing, draft.trim())
    setEditing(null)
  }

  return (
    <aside className="flex w-[230px] shrink-0 flex-col border-r border-line bg-panel/40">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-dim">chat</span>
        <button
          onClick={onNew}
          title="Nuova chat"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-phosphor/40 bg-phosphor/10 text-base text-phosphor transition hover:bg-phosphor/20"
        >
          +
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && (
          <div className="mt-8 px-2 text-center font-mono text-[11px] leading-relaxed text-ink-faint">
            Nessuna chat.
            <br />
            Premi <span className="text-phosphor">+</span> o scrivi un messaggio.
          </div>
        )}
        <AnimatePresence initial={false}>
          {conversations.map((c) => {
            const active = c.id === activeId
            const streaming = streamingIds.has(c.id)
            return (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={() => onSelect(c.id)}
                className={`group flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 transition-colors ${
                  active
                    ? 'border-phosphor/40 bg-phosphor/10'
                    : 'border-transparent hover:border-line hover:bg-elev/50'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    streaming ? 'bg-phosphor animate-pulse' : active ? 'bg-phosphor' : 'bg-ink-faint'
                  }`}
                />
                {editing === c.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 rounded border border-phosphor/40 bg-void/60 px-1 py-0.5 font-sans text-[12px] text-ink outline-none"
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      startEdit(c)
                    }}
                    className={`min-w-0 flex-1 truncate font-sans text-[12px] ${
                      active ? 'text-ink' : 'text-ink-dim'
                    }`}
                    title={c.title || 'Nuova chat'}
                  >
                    {c.title || 'Nuova chat'}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(c.id)
                  }}
                  title="Elimina chat"
                  className="text-ink-faint opacity-0 transition group-hover:opacity-100 hover:text-danger"
                >
                  ×
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </aside>
  )
}

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../lib/store'
import type { SavedCommand } from '@shared/types'

const uid = (): string => Math.random().toString(36).slice(2, 9)

interface Draft {
  id?: string
  label: string
  command: string
  runOnSend: boolean
}

const EMPTY: Draft = { label: '', command: '', runOnSend: true }

export default function GlobalCommands(): JSX.Element {
  const { globalCommands, saveGlobalCommands, injectToActive, tabs, activeTabId, view } = useStore()
  const [draft, setDraft] = useState<Draft | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const canRun = view === 'terminal' && activeTab?.status === 'ready'

  const commit = (): void => {
    if (!draft || !draft.command.trim()) {
      setDraft(null)
      return
    }
    const entry: SavedCommand = {
      id: draft.id ?? uid(),
      label: draft.label.trim() || draft.command.trim(),
      command: draft.command.trim(),
      runOnSend: draft.runOnSend
    }
    const next = draft.id
      ? globalCommands.map((c) => (c.id === draft.id ? entry : c))
      : [...globalCommands, entry]
    saveGlobalCommands(next)
    setDraft(null)
  }

  const remove = (id: string): void => {
    saveGlobalCommands(globalCommands.filter((c) => c.id !== id))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-1">
        <p className="font-sans text-[11px] leading-snug text-ink-dim">
          {canRun ? 'Clic per inviare al terminale attivo.' : 'Apri un terminale per eseguirli.'}
        </p>
        <button
          onClick={() => setDraft({ ...EMPTY })}
          className="shrink-0 font-mono text-[11px] text-phosphor transition hover:text-glow"
        >
          ＋ nuovo
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {/* Editor del nuovo comando (in cima). */}
        <AnimatePresence>
          {draft && !draft.id && <CommandEditor draft={draft} setDraft={setDraft} onCommit={commit} />}
        </AnimatePresence>

        {globalCommands.length === 0 && !draft && (
          <div className="mt-8 px-3 text-center font-mono text-[12px] leading-relaxed text-ink-faint">
            Nessun comando globale.
            <br />
            Premi <span className="text-phosphor">＋ nuovo</span> per crearne uno.
          </div>
        )}

        {globalCommands.map((cmd) =>
          draft?.id === cmd.id ? (
            <CommandEditor key={cmd.id} draft={draft} setDraft={setDraft} onCommit={commit} />
          ) : (
            <motion.div
              key={cmd.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="group flex items-center gap-2 rounded-lg border border-line bg-elev/70 p-2.5 transition-colors hover:border-phosphor/30"
            >
              <button
                disabled={!canRun}
                onClick={(e) => injectToActive(cmd.command, e.altKey ? false : cmd.runOnSend)}
                title={canRun ? cmd.command : 'Nessun terminale attivo'}
                className="flex min-w-0 flex-1 flex-col items-start text-left disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5 truncate font-mono text-[12px] text-ink">
                  <span className="text-phosphor">▸</span>
                  {cmd.label}
                </span>
                <span className="mt-0.5 truncate font-mono text-[10px] text-ink-dim">
                  {cmd.command}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() =>
                    setDraft({ id: cmd.id, label: cmd.label, command: cmd.command, runOnSend: cmd.runOnSend })
                  }
                  className="px-1 text-ink-faint transition hover:text-phosphor"
                  title="Modifica"
                >
                  ✎
                </button>
                <button
                  onClick={() => remove(cmd.id)}
                  className="px-1 text-ink-faint transition hover:text-danger"
                  title="Elimina"
                >
                  ×
                </button>
              </div>
            </motion.div>
          )
        )}
      </div>
    </div>
  )
}

function CommandEditor({
  draft,
  setDraft,
  onCommit
}: {
  draft: Draft
  setDraft: (d: Draft | null) => void
  onCommit: () => void
}): JSX.Element {
  const input =
    'w-full rounded-md border border-line bg-void/60 px-2.5 py-1.5 text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-phosphor/50'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="rounded-lg border border-phosphor/40 bg-elev p-2.5"
    >
      <input
        autoFocus
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        placeholder="etichetta"
        className={input + ' mb-1.5'}
      />
      <input
        value={draft.command}
        onChange={(e) => setDraft({ ...draft, command: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onCommit()}
        placeholder="docker ps -a"
        className={input + ' font-mono'}
      />
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 font-mono text-[10px] text-ink-dim">
          <input
            type="checkbox"
            checked={draft.runOnSend}
            onChange={(e) => setDraft({ ...draft, runOnSend: e.target.checked })}
            className="accent-phosphor"
          />
          esegui subito
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setDraft(null)}
            className="font-mono text-[11px] text-ink-dim transition hover:text-ink"
          >
            annulla
          </button>
          <button
            onClick={onCommit}
            className="rounded border border-phosphor/50 bg-phosphor/15 px-2.5 py-1 font-mono text-[11px] text-phosphor transition hover:bg-phosphor/25"
          >
            salva
          </button>
        </div>
      </div>
    </motion.div>
  )
}

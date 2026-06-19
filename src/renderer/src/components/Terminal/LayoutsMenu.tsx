import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../lib/store'

/** Menu per salvare il workspace corrente come layout e ripristinarne uno salvato. */
export default function LayoutsMenu(): JSX.Element {
  const { savedLayouts, tabs, saveCurrentLayout, restoreLayout, deleteLayout } = useStore()
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)

  const confirmSave = (): void => {
    const name = naming?.trim()
    if (name) saveCurrentLayout(name)
    setNaming(null)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Layout salvati"
        className="flex h-7 items-center gap-1 rounded-md border border-line px-2 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/30 hover:text-phosphor"
      >
        ▦ layout
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute right-0 top-9 z-50 w-60 rounded-lg border border-line bg-panel/95 p-2 shadow-panel backdrop-blur"
            >
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                layout salvati
              </div>

              <div className="max-h-52 space-y-1 overflow-y-auto">
                {savedLayouts.length === 0 && (
                  <div className="px-1 py-2 font-mono text-[11px] text-ink-faint">
                    Nessun layout salvato.
                  </div>
                )}
                {savedLayouts.map((l) => (
                  <div key={l.name} className="group flex items-center gap-1">
                    <button
                      onClick={() => {
                        restoreLayout(l.name)
                        setOpen(false)
                      }}
                      className="flex-1 truncate rounded px-2 py-1.5 text-left font-mono text-[12px] text-ink transition hover:bg-elev hover:text-phosphor"
                    >
                      ↻ {l.name}
                      <span className="ml-1 text-ink-faint">· {l.tabs.length} schede</span>
                    </button>
                    <button
                      onClick={() => deleteLayout(l.name)}
                      title="Elimina"
                      className="px-1 text-ink-faint opacity-0 transition hover:text-danger group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 border-t border-line pt-2">
                {naming === null ? (
                  <button
                    onClick={() => setNaming('')}
                    disabled={tabs.length === 0}
                    className="w-full rounded px-2 py-1.5 text-left font-mono text-[12px] text-phosphor transition hover:bg-elev disabled:opacity-40"
                  >
                    ＋ salva layout corrente
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={naming}
                      onChange={(e) => setNaming(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmSave()
                        if (e.key === 'Escape') setNaming(null)
                      }}
                      placeholder="nome layout"
                      className="flex-1 rounded border border-line bg-void/60 px-2 py-1 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
                    />
                    <button onClick={confirmSave} className="px-1.5 font-mono text-[11px] text-phosphor">
                      ok
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../lib/store'
import type { Connection } from '@shared/types'

interface Props {
  connection?: Connection
  disabled: boolean
}

/**
 * Barra dei comandi salvati per la connessione attiva. Un clic invia il comando
 * al terminale corrente; Alt+clic lo digita senza premere Invio.
 */
export default function CommandRail({ connection, disabled }: Props): JSX.Element | null {
  const injectToActive = useStore((s) => s.injectToActive)
  const commands = connection?.commands ?? []
  if (commands.length === 0) return null

  return (
    <div className="flex items-center gap-2 border-t border-line bg-panel/70 px-3 py-2">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.28em] text-ink-faint">
        snippet
      </span>
      <div className="flex flex-1 items-center gap-2 overflow-x-auto">
        <AnimatePresence initial={false}>
          {commands.map((cmd) => (
            <motion.button
              key={cmd.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              disabled={disabled}
              title={cmd.command + (cmd.runOnSend ? '  ⏎' : '')}
              onClick={(e) => injectToActive(cmd.command, e.altKey ? false : cmd.runOnSend)}
              className="group relative shrink-0 rounded-md border border-line bg-elev px-3 py-1.5 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/40 hover:text-phosphor disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="text-phosphor/70 group-hover:text-phosphor">▸ </span>
              {cmd.label}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

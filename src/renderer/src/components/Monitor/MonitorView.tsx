import { motion } from 'framer-motion'
import { useStore } from '../../lib/store'
import MonitorDashboard from './MonitorDashboard'

export default function MonitorView(): JSX.Element {
  const { connections, monitorTargetId } = useStore()
  const target = connections.find((c) => c.id === monitorTargetId)

  if (!target) {
    return (
      <div className="flex flex-1 items-center justify-center text-center">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-line bg-elev/60 text-2xl text-phosphor text-glow">
            ◍
          </div>
          <h2 className="mb-2 font-display text-xl text-ink">Monitoraggio server</h2>
          <p className="max-w-sm font-mono text-[13px] leading-relaxed text-ink-dim">
            Scegli una connessione a sinistra e premi{' '}
            <span className="text-phosphor">monitora</span> per vedere CPU, memoria,
            dischi e processi in tempo reale.
          </p>
        </motion.div>
      </div>
    )
  }

  // key sul target: rimonta la dashboard quando cambi server da monitorare.
  return <MonitorDashboard key={target.id} connection={target} />
}

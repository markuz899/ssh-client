import { motion } from 'framer-motion'
import { useStore } from '../../lib/store'
import DockerDashboard from './DockerDashboard'

export default function DockerView(): JSX.Element {
  const { connections, dockerTargetId } = useStore()
  const target = connections.find((c) => c.id === dockerTargetId)

  if (!target) {
    return (
      <div className="flex flex-1 items-center justify-center text-center">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-line bg-elev/60 text-2xl text-phosphor text-glow">
            ❒
          </div>
          <h2 className="mb-2 font-display text-xl text-ink">Docker</h2>
          <p className="max-w-sm font-mono text-[13px] leading-relaxed text-ink-dim">
            Scegli una connessione a sinistra e premi{' '}
            <span className="text-phosphor">docker</span> per rilevare i container,
            controllarne lo stato e aprire log o shell.
          </p>
        </motion.div>
      </div>
    )
  }

  // key sul target: rimonta tutto quando cambi server.
  return <DockerDashboard key={target.id} connection={target} />
}

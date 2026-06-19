import { motion } from 'framer-motion'
import { loadColor } from '../../lib/format'

interface Props {
  label: string
  percent: number
  detail?: string
  mono?: string
}

/** Barra orizzontale animata per RAM, swap e dischi. */
export default function MetricBar({ label, percent, detail, mono }: Props): JSX.Element {
  const clamped = Math.max(0, Math.min(100, percent))
  const color = loadColor(clamped)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[12px] text-ink">{label}</span>
        {detail && <span className="shrink-0 font-mono text-[11px] text-ink-dim">{detail}</span>}
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-phosphor/10">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 10px ${color}99` }}
          animate={{ width: `${clamped}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-faint">
        <span>{mono}</span>
        <span style={{ color }}>{clamped.toFixed(1)}%</span>
      </div>
    </div>
  )
}

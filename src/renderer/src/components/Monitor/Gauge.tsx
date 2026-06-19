import { motion } from 'framer-motion'
import { loadColor } from '../../lib/format'

interface Props {
  value: number // 0-100
  label: string
  sublabel?: string
  size?: number
}

/** Anello circolare animato per la percentuale CPU. */
export default function Gauge({ value, label, sublabel, size = 188 }: Props): JSX.Element {
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, value))
  const offset = c - (clamped / 100) * c
  const color = loadColor(clamped)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(94,246,255,0.10)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
          style={{ filter: `drop-shadow(0 0 6px ${color}aa)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={Math.round(clamped)}
          initial={{ opacity: 0.5, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-mono text-4xl font-bold tabular-nums"
          style={{ color }}
        >
          {clamped.toFixed(0)}
          <span className="text-xl">%</span>
        </motion.span>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
          {label}
        </span>
        {sublabel && (
          <span className="mt-0.5 font-mono text-[11px] text-ink-dim">{sublabel}</span>
        )}
      </div>
    </div>
  )
}

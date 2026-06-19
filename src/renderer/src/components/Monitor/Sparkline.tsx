interface Props {
  data: number[] // valori 0-100
  width?: number
  height?: number
  color?: string
}

/** Mini grafico storico (CPU) disegnato come path SVG. */
export default function Sparkline({
  data,
  width = 360,
  height = 64,
  color = '#5EF6FF'
}: Props): JSX.Element {
  const max = 100
  const n = data.length
  const pts = data.map((v, i) => {
    const x = n <= 1 ? 0 : (i / (n - 1)) * width
    const y = height - (Math.max(0, Math.min(max, v)) / max) * height
    return [x, y] as const
  })
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = pts.length
    ? `${line} L${width},${height} L0,${height} Z`
    : ''

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill="url(#spark-fill)" />}
      {line && (
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
        />
      )}
    </svg>
  )
}

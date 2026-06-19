import { useRef, type ReactNode, type MouseEvent } from 'react'

interface Props {
  children: ReactNode
  className?: string
  spotlightColor?: string
}

/**
 * "SpotlightCard" in stile reactbits: un bagliore radiale segue il cursore
 * dentro la card. Usa variabili CSS per evitare re-render a ogni movimento.
 */
export default function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(94,246,255,0.16)'
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = (e: MouseEvent<HTMLDivElement>): void => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
    el.style.setProperty('--my', `${e.clientY - rect.top}px`)
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={`group relative overflow-hidden ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(380px circle at var(--mx, 50%) var(--my, 50%), ${spotlightColor}, transparent 60%)`
        }}
      />
      {children}
    </div>
  )
}

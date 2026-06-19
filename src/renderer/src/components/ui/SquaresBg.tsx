import { useEffect, useRef } from 'react'

interface Props {
  /** Velocità di scorrimento diagonale del reticolo. */
  speed?: number
  squareSize?: number
  /** Accento in formato "R G B" (dalle Impostazioni); colora reticolo e hover. */
  accent?: string
  className?: string
}

/**
 * Sfondo "Squares" in stile reactbits: una griglia che scorre lentamente in
 * diagonale e si illumina sotto il cursore. Disegnata su canvas per restare
 * fluida anche a tutto schermo. Rispetta prefers-reduced-motion.
 */
export default function SquaresBg({
  speed = 0.4,
  squareSize = 44,
  accent = '94 246 255',
  className = ''
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const rgb = accent.trim().split(/\s+/).join(',')
    const borderColor = `rgba(${rgb},0.10)`
    const hoverColor = `rgba(${rgb},0.22)`
    const fillColor = `rgba(${rgb},0.06)`
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let offset = 0
    const hover = { x: -1, y: -1 }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const voidRgb =
      getComputedStyle(document.documentElement).getPropertyValue('--c-void').trim().split(/\s+/).join(',') ||
      '6,10,18'

    const resize = (): void => {
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const draw = (): void => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)
      const s = squareSize
      const shift = offset % s

      ctx.lineWidth = 1
      for (let x = -s; x <= w + s; x += s) {
        for (let y = -s; y <= h + s; y += s) {
          const px = x - shift
          const py = y - shift
          const isHover =
            hover.x >= px && hover.x < px + s && hover.y >= py && hover.y < py + s
          ctx.strokeStyle = isHover ? hoverColor : borderColor
          ctx.strokeRect(px, py, s, s)
          if (isHover) {
            ctx.fillStyle = fillColor
            ctx.fillRect(px, py, s, s)
          }
        }
      }

      // Vignettatura radiale per dare profondità.
      const grad = ctx.createRadialGradient(w / 2, h * 0.1, 0, w / 2, h / 2, h)
      grad.addColorStop(0, `rgba(${voidRgb},0)`)
      grad.addColorStop(1, `rgba(${voidRgb},0.92)`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      if (!reduce) offset += speed
      raf = requestAnimationFrame(draw)
    }
    draw()

    const onMove = (e: MouseEvent): void => {
      const rect = canvas.getBoundingClientRect()
      hover.x = e.clientX - rect.left
      hover.y = e.clientY - rect.top
    }
    const onLeave = (): void => {
      hover.x = -1
      hover.y = -1
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseout', onLeave)
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseout', onLeave)
      window.removeEventListener('resize', resize)
    }
  }, [speed, squareSize, accent])

  return <canvas ref={canvasRef} className={`h-full w-full ${className}`} />
}

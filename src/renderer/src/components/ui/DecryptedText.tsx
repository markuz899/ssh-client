import { useEffect, useRef, useState } from 'react'

interface Props {
  text: string
  /** Velocità in ms tra un passo e l'altro dell'animazione. */
  speed?: number
  className?: string
  /** Riavvia l'effetto ogni volta che cambia questa chiave. */
  trigger?: string | number
}

const CHARS = '!<>-_\\/[]{}—=+*^?#01abcdef'

/**
 * Effetto "DecryptedText" in stile reactbits: il testo si rivela carattere per
 * carattere mentre i restanti continuano a fare scramble. Perfetto per stringhe
 * tipo host/utente durante la fase di handshake.
 */
export default function DecryptedText({
  text,
  speed = 38,
  className = '',
  trigger
}: Props): JSX.Element {
  const [display, setDisplay] = useState(text)
  const frame = useRef(0)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setDisplay(text)
      return
    }
    let revealed = 0
    frame.current = 0
    const id = window.setInterval(() => {
      const out = text
        .split('')
        .map((ch, i) => {
          if (ch === ' ') return ' '
          if (i < revealed) return ch
          return CHARS[Math.floor(Math.random() * CHARS.length)]
        })
        .join('')
      setDisplay(out)
      frame.current += 1
      if (frame.current % 2 === 0) revealed += 1
      if (revealed > text.length) window.clearInterval(id)
    }, speed)
    return () => window.clearInterval(id)
  }, [text, speed, trigger])

  return <span className={className}>{display}</span>
}

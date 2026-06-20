// Cattura passiva dell'output dei terminali, per fornire contesto all'AI.
// Tiene un buffer scorrevole per sessione, ripulito dagli escape ANSI.

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g
const MAX_CHARS = 16000

const buffers = new Map<string, string>()
let initialized = false

export function initTerminalCapture(): () => void {
  if (initialized) return () => undefined
  initialized = true
  const off = window.phosphor.session.onData((e) => {
    const clean = e.data.replace(ANSI, '').replace(/\r/g, '')
    const next = (buffers.get(e.sessionId) ?? '') + clean
    buffers.set(e.sessionId, next.length > MAX_CHARS ? next.slice(-MAX_CHARS) : next)
  })
  return () => {
    off()
    initialized = false
  }
}

/** Coda recente dell'output di una sessione, fino a `maxChars` caratteri. */
export function getTerminalTail(sessionId: string | undefined, maxChars = 6000): string {
  if (!sessionId) return ''
  const buf = buffers.get(sessionId) ?? ''
  return buf.slice(-maxChars).trim()
}

export function clearTerminalCapture(sessionId: string): void {
  buffers.delete(sessionId)
}

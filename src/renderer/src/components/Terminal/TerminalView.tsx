import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { registerData } from '../../lib/sessionBus'
import { registerTerminal } from '../../lib/terminalRegistry'
import { useSettings } from '../../lib/settings'
import { matchAndDispatch } from '../../lib/shortcuts'
import type { Tab } from '../../lib/store'

interface Props {
  tab: Tab
  active: boolean
}

const THEME = {
  background: '#070C16',
  foreground: '#C9D6E5',
  cursor: '#5EF6FF',
  cursorAccent: '#070C16',
  selectionBackground: 'rgba(94,246,255,0.28)',
  black: '#0B121E',
  red: '#FF5C6A',
  green: '#5BF08A',
  yellow: '#FFB347',
  blue: '#5EA0F6',
  magenta: '#C792EA',
  cyan: '#5EF6FF',
  white: '#C9D6E5',
  brightBlack: '#41506580',
  brightRed: '#FF8088',
  brightGreen: '#86F5AC',
  brightYellow: '#FFC97A',
  brightBlue: '#8FBFFF',
  brightMagenta: '#DDBBFF',
  brightCyan: '#9CFBFF',
  brightWhite: '#FFFFFF'
}

export default function TerminalView({ tab, active }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  // Crea il terminale una volta sola, quando il sessionId è noto.
  useEffect(() => {
    if (!tab.sessionId || !hostRef.current || termRef.current) return

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: useSettings.getState().terminalFontSize,
      lineHeight: 1.35,
      letterSpacing: 0.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      theme: THEME,
      scrollback: 5000
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(new WebLinksAddon())
    term.open(hostRef.current)
    try {
      fit.fit()
    } catch {
      /* dimensioni non pronte */
    }
    termRef.current = term
    fitRef.current = fit

    // Le scorciatoie configurate hanno la precedenza sulla shell: se l'evento
    // combacia con un binding, lo intercettiamo prima che arrivi al pty.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (matchAndDispatch(e, useSettings.getState().shortcuts)) {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
      return true
    })

    const offRegistry = registerTerminal(tab.id, { terminal: term, search })

    const sessionId = tab.sessionId
    const offData = registerData(sessionId, (data) => term.write(data))
    term.onData((data) => window.phosphor.session.write(sessionId, data))
    term.onResize(({ cols, rows }) =>
      window.phosphor.session.resize(sessionId, cols, rows)
    )

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* noop */
      }
    })
    ro.observe(hostRef.current)

    return () => {
      offData()
      offRegistry()
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [tab.sessionId, tab.id])

  // Rifit + focus quando il tab torna attivo.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* noop */
      }
      termRef.current?.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [active, tab.sessionId])

  return (
    <div
      className="terminal-host h-full w-full"
      style={{ background: THEME.background }}
      ref={hostRef}
    />
  )
}

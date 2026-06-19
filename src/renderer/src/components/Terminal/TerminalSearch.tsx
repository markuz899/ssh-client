import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../lib/store'
import { useSettings } from '../../lib/settings'
import { getTerminal } from '../../lib/terminalRegistry'

interface Props {
  tabId: string
}

/**
 * Barra di ricerca sul terminale attivo. Usa il SearchAddon di xterm registrato
 * nel terminalRegistry. Invio = successivo, Shift+Invio = precedente, Esc = chiudi.
 */
export default function TerminalSearch({ tabId }: Props): JSX.Element {
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const accent = useSettings((s) => s.accent)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState({ index: -1, count: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  const options = {
    caseSensitive,
    decorations: {
      matchBackground: accent + '40',
      matchBorder: accent + '80',
      matchOverviewRuler: accent,
      activeMatchBackground: accent,
      activeMatchBorder: accent,
      activeMatchColorOverviewRuler: accent
    }
  }

  // Aggancio agli eventi del SearchAddon + focus iniziale.
  useEffect(() => {
    const entry = getTerminal(tabId)
    inputRef.current?.focus()
    inputRef.current?.select()
    if (!entry) return
    const sub = entry.search.onDidChangeResults((e) =>
      setResults({ index: e.resultIndex, count: e.resultCount })
    )
    return () => {
      sub.dispose()
      entry.search.clearDecorations()
    }
  }, [tabId])

  const find = (dir: 'next' | 'prev', q = query): void => {
    const entry = getTerminal(tabId)
    if (!entry) return
    if (!q) {
      entry.search.clearDecorations()
      setResults({ index: -1, count: 0 })
      return
    }
    if (dir === 'next') entry.search.findNext(q, options)
    else entry.search.findPrevious(q, options)
  }

  const close = (): void => {
    getTerminal(tabId)?.search.clearDecorations()
    setSearchOpen(false)
    getTerminal(tabId)?.terminal.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      find(e.shiftKey ? 'prev' : 'next')
    }
  }

  const noMatch = query.length > 0 && results.count === 0

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-lg border border-line bg-panel/95 px-2 py-1.5 shadow-panel backdrop-blur"
    >
      <span className="pl-1 font-mono text-[11px] text-phosphor">⌕</span>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          find('next', e.target.value)
        }}
        onKeyDown={onKeyDown}
        placeholder="cerca nel terminale"
        className={`w-52 rounded-md border bg-void/60 px-2.5 py-1 font-mono text-[12px] text-ink outline-none transition placeholder:text-ink-faint ${
          noMatch ? 'border-danger/60' : 'border-line focus:border-phosphor/50'
        }`}
      />
      <span className="w-14 text-center font-mono text-[11px] tabular-nums text-ink-dim">
        {results.count > 0 ? `${results.index + 1}/${results.count}` : noMatch ? '0/0' : '—'}
      </span>
      <button
        onClick={() => setCaseSensitive((v) => !v)}
        title="Maiuscole/minuscole"
        className={`rounded px-1.5 py-1 font-mono text-[11px] transition ${
          caseSensitive ? 'bg-phosphor/15 text-phosphor' : 'text-ink-dim hover:text-ink'
        }`}
      >
        Aa
      </button>
      <button
        onClick={() => find('prev')}
        title="Precedente (Shift+Invio)"
        className="rounded px-1.5 py-1 text-ink-dim transition hover:text-phosphor"
      >
        ↑
      </button>
      <button
        onClick={() => find('next')}
        title="Successivo (Invio)"
        className="rounded px-1.5 py-1 text-ink-dim transition hover:text-phosphor"
      >
        ↓
      </button>
      <button
        onClick={close}
        title="Chiudi (Esc)"
        className="rounded px-1.5 py-1 text-ink-dim transition hover:text-danger"
      >
        ×
      </button>
    </motion.div>
  )
}

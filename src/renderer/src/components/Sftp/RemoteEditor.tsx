import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface Props {
  sftpId: string
  path: string
  name: string
  onClose: () => void
  onSaved: () => void
}

type Phase = 'loading' | 'ready' | 'error'

/**
 * Editor remoto in-app: scarica il contenuto del file via SFTP, lo mostra in un
 * editor testuale con numeri di riga e lo ri-carica sul server al salvataggio
 * (⌘/Ctrl+S). Rifiuta file binari o troppo grandi (gestito nel main).
 */
export default function RemoteEditor({ sftpId, path, name, onClose, onSaved }: Props): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | undefined>()
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  const dirty = content !== original

  useEffect(() => {
    let cancelled = false
    window.phosphor.sftp.readFile(sftpId, path).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setContent(res.data)
        setOriginal(res.data)
        setPhase('ready')
        setTimeout(() => textareaRef.current?.focus(), 30)
      } else {
        setError(res.error)
        setPhase('error')
      }
    })
    return () => {
      cancelled = true
    }
  }, [sftpId, path])

  const save = async (): Promise<void> => {
    if (!dirty || saving) return
    setSaving(true)
    setError(undefined)
    const res = await window.phosphor.sftp.writeFile(sftpId, path, content)
    setSaving(false)
    if (res.ok) {
      setOriginal(content)
      setSavedAt(Date.now())
      onSaved()
    } else {
      setError(res.error)
    }
  }

  const tryClose = (): void => {
    if (dirty && !window.confirm('Ci sono modifiche non salvate. Chiudere comunque?')) return
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      tryClose()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart
      const end = el.selectionEnd
      const next = content.slice(0, start) + '  ' + content.slice(end)
      setContent(next)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2
      })
    }
  }

  const lineCount = Math.max(content.split('\n').length, 1)

  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col bg-void"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line bg-panel/70 px-4 py-2.5">
        <span className="text-phosphor">✎</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[13px] text-ink">
            {name}
            {dirty && <span className="ml-2 text-amber">●</span>}
          </div>
          <div className="truncate font-mono text-[10px] text-ink-dim">{path}</div>
        </div>
        {savedAt && !dirty && (
          <span className="font-mono text-[10px] text-matrix">salvato</span>
        )}
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md border border-phosphor/50 bg-phosphor/15 px-4 py-1.5 font-mono text-[11px] text-phosphor transition hover:bg-phosphor/25 disabled:opacity-40"
        >
          {saving ? 'salvataggio…' : 'salva ⌘S'}
        </button>
        <button
          onClick={tryClose}
          title="Chiudi (Esc)"
          className="rounded-md border border-line px-2.5 py-1.5 font-mono text-[12px] text-ink-dim transition hover:border-danger/40 hover:text-danger"
        >
          ×
        </button>
      </div>

      {/* Corpo */}
      {phase === 'loading' ? (
        <div className="flex flex-1 items-center justify-center font-mono text-[12px] text-ink-dim">
          lettura del file…
        </div>
      ) : phase === 'error' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-2xl text-danger">×</div>
          <p className="max-w-sm font-mono text-[12px] text-danger/90">{error}</p>
          <button
            onClick={onClose}
            className="rounded-md border border-line px-4 py-2 font-mono text-xs text-ink-dim hover:text-ink"
          >
            chiudi
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Numeri di riga */}
          <div
            ref={gutterRef}
            className="select-none overflow-hidden border-r border-line bg-panel/30 py-3 pl-3 pr-2 text-right font-mono text-[13px] leading-[1.5] text-ink-faint"
            style={{ minWidth: `${String(lineCount).length + 1}ch` }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          {/* Area di testo */}
          <textarea
            ref={textareaRef}
            value={content}
            spellCheck={false}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={(e) => {
              if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
            }}
            className="flex-1 resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-[1.5] text-ink outline-none"
            style={{ tabSize: 2 }}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-line bg-panel/60 px-4 py-1.5 font-mono text-[10px] text-ink-dim">
        <span>{lineCount} righe</span>
        <span className={dirty ? 'text-amber' : error ? 'text-danger' : 'text-ink-dim'}>
          {error ?? (dirty ? 'modifiche non salvate' : 'nessuna modifica')}
        </span>
      </div>
    </motion.div>
  )
}

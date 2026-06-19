import { useEffect, useMemo, useRef, useState } from 'react'
import type { Stream } from './LogsView'

type Level = 'ERROR' | 'WARN' | 'INFO' | 'ALTRO'
interface LogLine {
  id: number
  text: string
  level: Level
}

const MAX_BUFFER = 5000
const MAX_RENDER = 2000
const LEVELS: Level[] = ['INFO', 'WARN', 'ERROR', 'ALTRO']

const LEVEL_COLOR: Record<Level, string> = {
  ERROR: 'text-danger',
  WARN: 'text-amber',
  INFO: 'text-ink',
  ALTRO: 'text-ink-dim'
}
const LEVEL_CHIP: Record<Level, string> = {
  ERROR: 'border-danger/50 text-danger',
  WARN: 'border-amber/50 text-amber',
  INFO: 'border-phosphor/40 text-phosphor',
  ALTRO: 'border-line text-ink-dim'
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

function parseLevel(text: string): Level {
  if (/\b(error|err|fatal|crit|critical|fail|failed|panic|emerg|alert)\b/i.test(text)) return 'ERROR'
  if (/\b(warn|warning)\b/i.test(text)) return 'WARN'
  if (/\b(info|notice)\b/i.test(text)) return 'INFO'
  return 'ALTRO'
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text
  const lower = text.toLowerCase()
  const t = term.toLowerCase()
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    const idx = lower.indexOf(t, i)
    if (idx === -1) {
      out.push(text.slice(i))
      break
    }
    if (idx > i) out.push(text.slice(i, idx))
    out.push(
      <mark key={key++} className="rounded bg-phosphor/30 text-ink">
        {text.slice(idx, idx + term.length)}
      </mark>
    )
    i = idx + term.length
  }
  return out
}

export default function LogStream({
  stream,
  onClose
}: {
  stream: Stream
  onClose: () => void
}): JSX.Element {
  const buffer = useRef<LogLine[]>([])
  const partial = useRef('')
  const seq = useRef(0)
  const lastLen = useRef(0)
  const lenAtPause = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [, setVersion] = useState(0)
  const [paused, setPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const [levels, setLevels] = useState<Set<Level>>(new Set(LEVELS))
  const [status, setStatus] = useState<string>('connecting')
  const [statusMsg, setStatusMsg] = useState<string | undefined>()
  const [newWhilePaused, setNewWhilePaused] = useState(0)

  // Sottoscrizione ai dati/stato dello stream.
  useEffect(() => {
    const offData = window.phosphor.logs.onData((e) => {
      if (e.logId !== stream.id) return
      const clean = (partial.current + e.chunk).replace(ANSI, '').replace(/\r/g, '')
      const parts = clean.split('\n')
      partial.current = parts.pop() ?? ''
      for (const text of parts) {
        buffer.current.push({ id: seq.current++, text, level: parseLevel(text) })
      }
      if (buffer.current.length > MAX_BUFFER) {
        buffer.current = buffer.current.slice(-MAX_BUFFER)
      }
    })
    const offStatus = window.phosphor.logs.onStatus((e) => {
      if (e.logId !== stream.id) return
      setStatus(e.status)
      setStatusMsg(e.message)
    })
    return () => {
      offData()
      offStatus()
    }
  }, [stream.id])

  // Flush periodico verso il render (rispetta la pausa).
  useEffect(() => {
    const t = window.setInterval(() => {
      const len = buffer.current.length
      if (paused) {
        setNewWhilePaused(len - lenAtPause.current)
        return
      }
      if (len !== lastLen.current) {
        lastLen.current = len
        setVersion((v) => v + 1)
      }
    }, 140)
    return () => window.clearInterval(t)
  }, [paused])

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const out = buffer.current.filter(
      (l) => levels.has(l.level) && (f === '' || l.text.toLowerCase().includes(f))
    )
    return out.slice(-MAX_RENDER)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, levels, paused, lastLen.current])

  // Autoscroll quando arrivano righe nuove (se non in pausa e attivo).
  useEffect(() => {
    if (autoScroll && !paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  })

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setAutoScroll(atBottom)
  }

  const togglePause = (): void => {
    setPaused((p) => {
      const next = !p
      if (next) lenAtPause.current = buffer.current.length
      else {
        setNewWhilePaused(0)
        lastLen.current = -1 // forza un flush al ripristino
      }
      return next
    })
  }

  const clear = (): void => {
    buffer.current = []
    seq.current = 0
    lastLen.current = 0
    lenAtPause.current = 0
    setNewWhilePaused(0)
    setVersion((v) => v + 1)
  }

  const toggleLevel = (lvl: Level): void => {
    setLevels((prev) => {
      const next = new Set(prev)
      if (next.has(lvl)) next.delete(lvl)
      else next.add(lvl)
      return next
    })
  }

  const exportLog = async (): Promise<void> => {
    const content = visible.map((l) => l.text).join('\n')
    const date = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    await window.phosphor.logs.export(content, `${stream.connName}-${date}.log`)
  }

  const counts = useMemo(() => {
    const c: Record<Level, number> = { INFO: 0, WARN: 0, ERROR: 0, ALTRO: 0 }
    for (const l of buffer.current) c[l.level]++
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastLen.current])

  return (
    <div className="flex h-full flex-col bg-[#070C16]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel/50 px-3 py-2">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === 'streaming' && !paused
                ? 'bg-matrix shadow-[0_0_6px_#5BF08A]'
                : status === 'error'
                  ? 'bg-danger'
                  : paused
                    ? 'bg-amber'
                    : 'bg-amber animate-pulse'
            }`}
          />
          {paused ? 'in pausa' : status === 'streaming' ? 'live' : status === 'error' ? 'errore' : status === 'closed' ? 'chiuso' : 'connessione'}
        </span>

        {/* Chip livelli */}
        <div className="flex items-center gap-1">
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => toggleLevel(lvl)}
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                levels.has(lvl) ? LEVEL_CHIP[lvl] : 'border-line text-ink-faint opacity-50'
              }`}
            >
              {lvl} {counts[lvl] > 0 && <span className="opacity-70">{counts[lvl]}</span>}
            </button>
          ))}
        </div>

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filtra / cerca…"
          className="min-w-[120px] flex-1 rounded-md border border-line bg-void/60 px-2.5 py-1 font-mono text-[11px] text-ink outline-none transition placeholder:text-ink-faint focus:border-phosphor/50"
        />

        <div className="flex items-center gap-1">
          <ToolBtn onClick={togglePause} active={paused}>
            {paused ? '▸ riprendi' : '❚❚ pausa'}
          </ToolBtn>
          <ToolBtn onClick={clear}>⌫ svuota</ToolBtn>
          <ToolBtn onClick={exportLog}>↧ esporta</ToolBtn>
          <ToolBtn onClick={onClose} danger>
            ✕ chiudi
          </ToolBtn>
        </div>
      </div>

      {/* Righe */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-[1.5]"
      >
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center text-ink-faint">
            {buffer.current.length === 0 ? 'in attesa di output…' : 'nessuna riga corrisponde ai filtri'}
          </div>
        ) : (
          visible.map((l) => (
            <div key={l.id} className="flex gap-2 whitespace-pre-wrap break-all">
              <span className={`shrink-0 ${LEVEL_CHIP[l.level].split(' ')[1]}`}>
                {l.level === 'ERROR' ? '●' : l.level === 'WARN' ? '▲' : l.level === 'INFO' ? '·' : ' '}
              </span>
              <span className={LEVEL_COLOR[l.level]}>{highlight(l.text, filter.trim())}</span>
            </div>
          ))
        )}
      </div>

      {/* Barra inferiore */}
      <div className="flex items-center justify-between border-t border-line bg-panel/40 px-3 py-1 font-mono text-[10px] text-ink-dim">
        <span className="truncate" title={stream.command}>
          $ {stream.command}
        </span>
        <div className="flex items-center gap-3">
          {paused && newWhilePaused > 0 && (
            <span className="text-amber">+{newWhilePaused} in coda</span>
          )}
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true)
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              }}
              className="text-phosphor hover:text-glow"
            >
              ↓ vai in fondo
            </button>
          )}
          <span>{buffer.current.length} righe</span>
        </div>
      </div>

      {status === 'error' && statusMsg && (
        <div className="border-t border-danger/40 bg-danger/10 px-3 py-1 font-mono text-[11px] text-danger">
          {statusMsg}
        </div>
      )}
    </div>
  )
}

function ToolBtn({
  children,
  onClick,
  active,
  danger
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2 py-1 font-mono text-[10px] transition ${
        active
          ? 'border-amber/50 bg-amber/15 text-amber'
          : danger
            ? 'border-line text-ink-dim hover:border-danger/40 hover:text-danger'
            : 'border-line text-ink-dim hover:border-phosphor/30 hover:text-phosphor'
      }`}
    >
      {children}
    </button>
  )
}

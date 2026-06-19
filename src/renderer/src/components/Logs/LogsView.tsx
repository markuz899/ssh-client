import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../lib/store'
import type { Connection, ConnectInput } from '@shared/types'
import LogStream from './LogStream'

export interface Stream {
  id: string // logId
  connectionId: string
  connName: string
  command: string
  color: string
}

const DEFAULT_CMD = 'tail -n 200 -F /var/log/syslog'

function inputFor(c: Connection): ConnectInput {
  return {
    connectionId: c.id,
    host: c.host,
    port: c.port,
    username: c.username,
    authMethod: c.authMethod,
    keyPath: c.keyPath
  }
}

export default function LogsView(): JSX.Element {
  const { connections, logsTargetId } = useStore()
  const target = connections.find((c) => c.id === logsTargetId)
  const [streams, setStreams] = useState<Stream[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [command, setCommand] = useState(DEFAULT_CMD)
  const [error, setError] = useState<string | null>(null)

  const openStream = async (): Promise<void> => {
    if (!target || !command.trim()) return
    setError(null)
    const res = await window.phosphor.logs.start(inputFor(target), command.trim())
    if (!res.ok) {
      setError(res.error)
      return
    }
    const stream: Stream = {
      id: res.data.logId,
      connectionId: target.id,
      connName: target.name,
      command: command.trim(),
      color: target.color
    }
    setStreams((s) => [...s, stream])
    setActiveId(stream.id)
  }

  const closeStream = (id: string): void => {
    window.phosphor.logs.stop(id)
    setStreams((s) => {
      const next = s.filter((x) => x.id !== id)
      if (activeId === id) setActiveId(next[next.length - 1]?.id ?? null)
      return next
    })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Barra apertura nuovo stream */}
      <div className="flex items-center gap-2 border-b border-line bg-panel/60 px-4 py-2.5">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.28em] text-ink-dim">
          stream
        </span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && openStream()}
          placeholder="tail -n 200 -F /var/log/nginx/error.log"
          className="min-w-0 flex-1 rounded-md border border-line bg-void/60 px-3 py-1.5 font-mono text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-phosphor/50"
        />
        <button
          onClick={openStream}
          disabled={!target}
          title={target ? `Avvia su ${target.name}` : 'Scegli un server a sinistra'}
          className="shrink-0 rounded-md border border-phosphor/40 bg-phosphor/10 px-3 py-1.5 font-mono text-[11px] text-phosphor transition hover:bg-phosphor/20 disabled:opacity-40"
        >
          ▸ apri{target ? ` · ${target.name}` : ''}
        </button>
      </div>

      {error && (
        <div className="border-b border-danger/40 bg-danger/10 px-4 py-1.5 font-mono text-[11px] text-danger">
          {error}
        </div>
      )}

      {/* Sotto-schede degli stream */}
      {streams.length > 0 && (
        <div className="flex items-stretch gap-1.5 overflow-x-auto border-b border-line bg-panel/40 px-2 pt-1.5">
          {streams.map((s) => {
            const isActive = s.id === activeId
            return (
              <div
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`group flex min-w-[150px] max-w-[240px] cursor-pointer items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 transition-colors ${
                  isActive ? 'border-line bg-elev text-ink' : 'border-transparent text-ink-dim hover:bg-elev/50'
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }}
                />
                <span className="flex-1 truncate font-mono text-[11px]" title={s.command}>
                  {s.connName}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeStream(s.id)
                  }}
                  className="text-ink-faint transition hover:text-danger"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Corpo */}
      <div className="relative flex-1 overflow-hidden">
        {streams.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-line bg-elev/60 text-2xl text-phosphor text-glow">
                ≣
              </div>
              <h2 className="mb-2 font-display text-xl text-ink">Log in tempo reale</h2>
              <p className="max-w-md font-mono text-[13px] leading-relaxed text-ink-dim">
                {target ? (
                  <>
                    Indica un comando di streaming (es. <span className="text-phosphor">tail -F</span>) e
                    premi <span className="text-phosphor">apri</span>. Ogni stream è indipendente.
                  </>
                ) : (
                  <>
                    Scegli un server dalla colonna a sinistra, poi avvia uno stream di log.
                  </>
                )}
              </p>
            </motion.div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {streams.map((s) => (
              <div
                key={s.id}
                className="absolute inset-0"
                style={{ visibility: s.id === activeId ? 'visible' : 'hidden' }}
              >
                <LogStream stream={s} onClose={() => closeStream(s.id)} />
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

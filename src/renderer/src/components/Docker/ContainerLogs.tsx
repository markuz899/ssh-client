import { useEffect, useRef, useState } from 'react'
import type { Connection, ConnectInput, DockerContainer, LogStatus } from '@shared/types'

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
const MAX_LINES = 4000

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

export default function ContainerLogs({
  connection,
  container,
  active
}: {
  connection: Connection
  container: DockerContainer
  active: boolean
}): JSX.Element {
  const [lines, setLines] = useState<string[]>([])
  const [status, setStatus] = useState<LogStatus>('connecting')
  const [statusMsg, setStatusMsg] = useState<string | undefined>()
  const [autoScroll, setAutoScroll] = useState(true)
  const partial = useRef('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let logId: string | undefined
    let offData = (): void => undefined
    let offStatus = (): void => undefined

    const command = `docker logs -f --tail 200 ${container.id}`
    window.phosphor.logs.start(inputFor(connection), command).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setStatus('error')
        setStatusMsg(res.error)
        return
      }
      logId = res.data.logId
      offData = window.phosphor.logs.onData((e) => {
        if (e.logId !== logId) return
        const clean = (partial.current + e.chunk).replace(ANSI, '').replace(/\r/g, '')
        const parts = clean.split('\n')
        partial.current = parts.pop() ?? ''
        if (parts.length === 0) return
        setLines((prev) => {
          const next = prev.concat(parts)
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
        })
      })
      offStatus = window.phosphor.logs.onStatus((e) => {
        if (e.logId !== logId) return
        setStatus(e.status)
        setStatusMsg(e.message)
      })
    })

    return () => {
      cancelled = true
      offData()
      offStatus()
      if (logId) window.phosphor.logs.stop(logId)
    }
  }, [connection.id, container.id])

  useEffect(() => {
    if (active && autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, active, autoScroll])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
  }

  return (
    <div className="flex h-full flex-col bg-[#070C16]">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-panel/50 px-3 py-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === 'streaming'
                ? 'bg-matrix shadow-[0_0_6px_#5BF08A]'
                : status === 'error'
                  ? 'bg-danger'
                  : 'bg-amber animate-pulse'
            }`}
          />
          {status === 'streaming'
            ? 'live'
            : status === 'error'
              ? 'errore'
              : status === 'closed'
                ? 'chiuso'
                : 'connessione'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setLines([])
              partial.current = ''
            }}
            className="rounded border border-line px-2 py-0.5 font-mono text-[10px] text-ink-dim transition hover:border-phosphor/30 hover:text-phosphor"
          >
            ⌫ svuota
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 select-text overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-[1.45]"
      >
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-ink-faint">
            {status === 'error' ? statusMsg : 'in attesa di output…'}
          </div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-all text-ink/90">
              {l}
            </div>
          ))
        )}
      </div>

      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }}
          className="border-t border-line bg-panel/40 py-1 font-mono text-[10px] text-phosphor hover:text-glow"
        >
          ↓ vai in fondo
        </button>
      )}

      {status === 'error' && statusMsg && lines.length > 0 && (
        <div className="border-t border-danger/40 bg-danger/10 px-3 py-1 font-mono text-[10px] text-danger">
          {statusMsg}
        </div>
      )}
    </div>
  )
}

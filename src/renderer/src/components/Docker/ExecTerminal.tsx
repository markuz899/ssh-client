import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSettings } from '../../lib/settings'
import type { Connection, ConnectInput, DockerContainer, DockerExecStatus } from '@shared/types'

const THEME = {
  background: '#070C16',
  foreground: '#C9D6E5',
  cursor: '#5EF6FF',
  cursorAccent: '#070C16',
  selectionBackground: 'rgba(94,246,255,0.28)'
}

function inputFor(c: Connection, cols: number, rows: number): ConnectInput {
  return {
    connectionId: c.id,
    host: c.host,
    port: c.port,
    username: c.username,
    authMethod: c.authMethod,
    keyPath: c.keyPath,
    cols,
    rows
  }
}

export default function ExecTerminal({
  connection,
  container,
  active
}: {
  connection: Connection
  container: DockerContainer
  active: boolean
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const execIdRef = useRef<string | null>(null)
  const [status, setStatus] = useState<DockerExecStatus>('connecting')
  const [statusMsg, setStatusMsg] = useState<string | undefined>()
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!hostRef.current) return
    let cancelled = false
    let offData = (): void => undefined
    let offStatus = (): void => undefined

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: useSettings.getState().terminalFontSize,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      theme: THEME,
      scrollback: 4000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    try {
      fit.fit()
    } catch {
      /* dimensioni non pronte */
    }
    termRef.current = term
    fitRef.current = fit

    setStatus('connecting')
    setStatusMsg(undefined)

    window.phosphor.docker.exec
      .open(inputFor(connection, term.cols, term.rows), container.id)
      .then((res) => {
        if (cancelled) return
        if (!res.ok) {
          setStatus('error')
          setStatusMsg(res.error)
          return
        }
        const execId = res.data.execId
        execIdRef.current = execId

        offData = window.phosphor.docker.exec.onData((e) => {
          if (e.execId === execId) term.write(e.data)
        })
        offStatus = window.phosphor.docker.exec.onStatus((e) => {
          if (e.execId !== execId) return
          setStatus(e.status)
          setStatusMsg(e.message)
        })
        term.onData((d) => window.phosphor.docker.exec.write(execId, d))
        term.onResize(({ cols, rows }) => window.phosphor.docker.exec.resize(execId, cols, rows))
      })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* noop */
      }
    })
    ro.observe(hostRef.current)

    return () => {
      cancelled = true
      offData()
      offStatus()
      ro.disconnect()
      if (execIdRef.current) window.phosphor.docker.exec.close(execIdRef.current)
      execIdRef.current = null
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, container.id, attempt])

  // Rifit + focus quando la scheda shell torna attiva.
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
  }, [active, status])

  return (
    <div className="relative h-full w-full" style={{ background: THEME.background }}>
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-line bg-panel/60 px-3 py-1">
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status === 'ready'
                ? 'bg-matrix shadow-[0_0_6px_#5BF08A]'
                : status === 'error'
                  ? 'bg-danger'
                  : status === 'closed'
                    ? 'bg-ink-faint'
                    : 'bg-amber animate-pulse'
            }`}
          />
          {status === 'ready'
            ? `docker exec · ${container.name}`
            : status === 'error'
              ? 'errore'
              : status === 'closed'
                ? 'sessione chiusa'
                : 'apertura shell…'}
        </span>
        {(status === 'closed' || status === 'error') && (
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="rounded border border-phosphor/40 bg-phosphor/10 px-2 py-0.5 font-mono text-[10px] text-phosphor transition hover:bg-phosphor/20"
          >
            ↻ riapri
          </button>
        )}
      </div>
      <div ref={hostRef} className="h-full w-full px-2 pb-2 pt-7" />
      {status === 'error' && statusMsg && (
        <div className="absolute bottom-0 left-0 right-0 border-t border-danger/40 bg-danger/10 px-3 py-1 font-mono text-[10px] text-danger">
          {statusMsg}
        </div>
      )}
    </div>
  )
}

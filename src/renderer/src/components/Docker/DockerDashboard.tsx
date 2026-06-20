import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type {
  Connection,
  ConnectInput,
  DockerContainer,
  DockerContainerAction,
  DockerEngineStatus,
  DockerInfo,
  DockerStats
} from '@shared/types'
import { useStore } from '../../lib/store'
import ContainerRow from './ContainerRow'
import ContainerInspector from './ContainerInspector'

const POLL_MS = 3000

export function inputFor(c: Connection): ConnectInput {
  return {
    connectionId: c.id,
    host: c.host,
    port: c.port,
    username: c.username,
    authMethod: c.authMethod,
    keyPath: c.keyPath
  }
}

/** Abbina le statistiche (id eventualmente corto) ai container (id completo). */
function statsById(containers: DockerContainer[], stats: DockerStats[]): Map<string, DockerStats> {
  const map = new Map<string, DockerStats>()
  for (const c of containers) {
    const s = stats.find((x) => c.id.startsWith(x.id) || x.id.startsWith(c.id) || x.name === c.name)
    if (s) map.set(c.id, s)
  }
  return map
}

export default function DockerDashboard({ connection }: { connection: Connection }): JSX.Element {
  const stopDocker = useStore((s) => s.setDockerTarget)
  const [engineStatus, setEngineStatus] = useState<DockerEngineStatus>('connecting')
  const [engineMsg, setEngineMsg] = useState<string | undefined>()
  const [info, setInfo] = useState<DockerInfo | null>(null)
  const [containers, setContainers] = useState<DockerContainer[]>([])
  const [stats, setStats] = useState<Map<string, DockerStats>>(new Map())
  const [error, setError] = useState<string | undefined>()
  const [paused, setPaused] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Distingue "ancora in caricamento" da "caricato ma vuoto" per non mostrare
  // il messaggio "nessun container" prima della prima lista.
  const [firstLoaded, setFirstLoaded] = useState(false)

  const engineRef = useRef<string | undefined>()
  const pausedRef = useRef(false)
  pausedRef.current = paused

  const refresh = useCallback(async (): Promise<void> => {
    const engineId = engineRef.current
    if (!engineId) return
    const [listRes, statsRes] = await Promise.all([
      window.phosphor.docker.list(engineId),
      window.phosphor.docker.stats(engineId)
    ])
    if (engineRef.current !== engineId) return
    if (listRes.ok) {
      setContainers(listRes.data)
      setError(undefined)
      setFirstLoaded(true)
      if (statsRes.ok) setStats(statsById(listRes.data, statsRes.data))
    } else {
      setError(listRes.error)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    let offStatus = (): void => undefined

    setEngineStatus('connecting')
    setEngineMsg(undefined)
    setInfo(null)
    setContainers([])
    setStats(new Map())
    setError(undefined)
    setFirstLoaded(false)

    const start = async (): Promise<void> => {
      const res = await window.phosphor.docker.open(inputFor(connection))
      if (cancelled) return
      if (!res.ok) {
        setEngineStatus('error')
        setEngineMsg(res.error)
        return
      }
      const engineId = res.data.engineId
      engineRef.current = engineId

      offStatus = window.phosphor.docker.onStatus((e) => {
        if (e.engineId !== engineId || cancelled) return
        setEngineStatus(e.status)
        setEngineMsg(e.message)
      })

      // Rileva Docker prima di iniziare a interrogare.
      const det = await window.phosphor.docker.detect(engineId)
      if (cancelled) return
      if (!det.ok) {
        setEngineStatus('error')
        setEngineMsg(det.error)
        return
      }
      setInfo(det.data)
      if (!det.data.installed || !det.data.canConnect) return

      await refresh()
      timer = window.setInterval(() => {
        if (!pausedRef.current) refresh()
      }, POLL_MS)
    }
    start()

    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
      offStatus()
      if (engineRef.current) window.phosphor.docker.close(engineRef.current)
      engineRef.current = undefined
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, attempt])

  const runAction = async (action: DockerContainerAction, c: DockerContainer): Promise<void> => {
    const engineId = engineRef.current
    if (!engineId) return
    if (action === 'remove' && !window.confirm(`Rimuovere il container "${c.name}"?`)) return
    setBusy((s) => new Set(s).add(c.id))
    const res = await window.phosphor.docker.action(engineId, action, c.id)
    if (!res.ok) setError(res.error)
    await refresh()
    setBusy((s) => {
      const next = new Set(s)
      next.delete(c.id)
      return next
    })
    if (action === 'remove' && selectedId === c.id) setSelectedId(null)
  }

  const retry = (): void => setAttempt((a) => a + 1)

  // ---- Stati a tutta pagina (connessione / errore / docker assente) ----
  if (engineStatus === 'connecting' && !info) {
    return <FullState connection={connection} kind="connecting" message={engineMsg} />
  }
  if (engineStatus === 'error' && !info) {
    return (
      <FullState connection={connection} kind="error" message={engineMsg} onRetry={retry} />
    )
  }
  if (info && !info.installed) {
    return (
      <FullState
        connection={connection}
        kind="absent"
        message={info.message ?? 'Docker non è installato.'}
        onRetry={retry}
      />
    )
  }
  if (info && !info.canConnect) {
    return (
      <FullState
        connection={connection}
        kind="error"
        message={info.message ?? 'Daemon Docker irraggiungibile.'}
        onRetry={retry}
      />
    )
  }

  const selected = containers.find((c) => c.id === selectedId) ?? null
  const running = containers.filter((c) => c.state === 'running').length
  const reconnecting = engineStatus === 'connecting' && info != null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Intestazione */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel/50 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-phosphor/40 bg-phosphor/10 text-lg text-phosphor text-glow">
            ❒
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg text-ink">{connection.name}</h2>
              {info?.serverVersion && (
                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">
                  engine {info.serverVersion}
                </span>
              )}
            </div>
            <div className="font-mono text-[11px] text-ink-dim">
              {running} attivi · {containers.length} totali
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
            <motion.span
              animate={
                reconnecting
                  ? { opacity: [1, 0.3, 1] }
                  : paused
                    ? { opacity: 0.4 }
                    : { opacity: [1, 0.4, 1] }
              }
              transition={{ duration: reconnecting ? 0.9 : 1.6, repeat: Infinity }}
              className={`h-1.5 w-1.5 rounded-full ${
                reconnecting ? 'bg-amber' : paused ? 'bg-amber' : 'bg-matrix shadow-[0_0_6px_#5BF08A]'
              }`}
            />
            {reconnecting ? 'riconnessione' : paused ? 'in pausa' : `live · ${(POLL_MS / 1000).toFixed(0)}s`}
          </span>
          <HeaderBtn onClick={() => refresh()} title="Aggiorna ora">
            ↻ aggiorna
          </HeaderBtn>
          <HeaderBtn onClick={() => setPaused((p) => !p)} active={paused}>
            {paused ? '▸ riprendi' : '❚❚ pausa'}
          </HeaderBtn>
          <button
            onClick={() => stopDocker(undefined)}
            title="Chiudi la sessione Docker"
            className="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 font-mono text-[11px] text-danger transition hover:bg-danger/20"
          >
            ■ stop
          </button>
        </div>
      </div>

      {(error || (reconnecting && engineMsg)) && (
        <div className="border-b border-amber/40 bg-amber/10 px-5 py-1.5 font-mono text-[11px] text-amber">
          {reconnecting ? engineMsg : error}
        </div>
      )}

      {/* Corpo: tabella container + ispettore */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5">
          {!firstLoaded ? (
            <BodyRadar />
          ) : containers.length === 0 ? (
            <div className="flex h-full items-center justify-center font-mono text-[13px] text-ink-dim">
              Nessun container presente su questo server.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full border-collapse font-mono text-[12px]">
                <thead>
                  <tr className="bg-void/50 text-left text-ink-dim">
                    <th className="px-3 py-2 font-normal">container</th>
                    <th className="w-28 px-3 py-2 font-normal">stato</th>
                    <th className="w-32 px-3 py-2 font-normal">uptime</th>
                    <th className="w-40 px-3 py-2 font-normal">porte</th>
                    <th className="w-44 px-3 py-2 font-normal">cpu / mem</th>
                    <th className="w-[150px] px-3 py-2 text-right font-normal">azioni</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {containers.map((c) => (
                      <ContainerRow
                        key={c.id}
                        container={c}
                        stats={stats.get(c.id)}
                        busy={busy.has(c.id)}
                        selected={selectedId === c.id}
                        onSelect={() => setSelectedId((id) => (id === c.id ? null : c.id))}
                        onAction={runAction}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <AnimatePresence>
          {selected && (
            <ContainerInspector
              key={selected.id}
              connection={connection}
              container={selected}
              stats={stats.get(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function BodyRadar(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center text-center"
      >
        <div className="relative mb-5 h-20 w-20">
          {[0, 0.6, 1.2].map((d) => (
            <span
              key={d}
              className="absolute inset-0 rounded-full border border-phosphor/40 animate-pulse-ring"
              style={{ animationDelay: `${d}s` }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center rounded-full border border-phosphor/40 text-xl text-phosphor text-glow">
            ❒
          </div>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink-dim">
          rilevamento container…
        </div>
      </motion.div>
    </div>
  )
}

function HeaderBtn({
  children,
  onClick,
  active,
  title
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  title?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition ${
        active
          ? 'border-amber/50 bg-amber/15 text-amber'
          : 'border-line text-ink-dim hover:border-phosphor/40 hover:text-phosphor'
      }`}
    >
      {children}
    </button>
  )
}

function FullState({
  connection,
  kind,
  message,
  onRetry
}: {
  connection: Connection
  kind: 'connecting' | 'error' | 'absent'
  message?: string
  onRetry?: () => void
}): JSX.Element {
  const label =
    kind === 'connecting'
      ? 'connessione al server'
      : kind === 'absent'
        ? 'docker non rilevato'
        : 'docker non disponibile'
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center text-center"
      >
        <div className="relative mb-6 h-24 w-24">
          {kind === 'connecting' &&
            [0, 0.6, 1.2].map((d) => (
              <span
                key={d}
                className="absolute inset-0 rounded-full border border-phosphor/40 animate-pulse-ring"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-full border text-2xl ${
              kind === 'connecting'
                ? 'border-phosphor/40 text-phosphor text-glow'
                : 'border-danger/50 text-danger'
            }`}
          >
            {kind === 'connecting' ? '❒' : '×'}
          </div>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink-dim">{label}</div>
        <div className="mt-1 font-mono text-base text-ink">{connection.name}</div>
        {message && <p className="mt-3 max-w-sm font-mono text-[12px] text-danger/90">{message}</p>}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 rounded-md border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-xs text-phosphor transition hover:bg-phosphor/20"
          >
            riprova
          </button>
        )}
      </motion.div>
    </div>
  )
}

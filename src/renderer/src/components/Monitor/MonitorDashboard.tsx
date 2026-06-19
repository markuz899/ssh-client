import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Connection, ConnectInput, MonitorSnapshot, MonitorStatus } from '@shared/types'
import { useStore } from '../../lib/store'
import { formatBytesFromKb, formatUptime, loadColor } from '../../lib/format'
import SpotlightCard from '../ui/SpotlightCard'
import Gauge from './Gauge'
import MetricBar from './MetricBar'
import Sparkline from './Sparkline'

const POLL_MS = 2500
const HISTORY = 48

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

export default function MonitorDashboard({ connection }: { connection: Connection }): JSX.Element {
  const [status, setStatus] = useState<MonitorStatus>('connecting')
  const [error, setError] = useState<string | undefined>()
  const [snap, setSnap] = useState<MonitorSnapshot | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const [attempt, setAttempt] = useState(0)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const retryRef = useRef(0)
  const stopMonitor = useStore((s) => s.setMonitorTarget)

  pausedRef.current = paused

  useEffect(() => {
    let cancelled = false
    let monitorId: string | undefined
    let timer: number | undefined
    let everReady = false
    let offStatus = (): void => undefined

    setStatus('connecting')
    setError(undefined)
    setSnap(null)
    setHistory([])

    const start = async (): Promise<void> => {
      const res = await window.phosphor.monitor.open(inputFor(connection))
      if (cancelled) return
      if (!res.ok) {
        setStatus('error')
        setError(res.error)
        return
      }
      monitorId = res.data.monitorId
      offStatus = window.phosphor.monitor.onStatus((e) => {
        if (e.monitorId !== monitorId || cancelled) return
        if (e.status === 'error') {
          setStatus('error')
          setError(e.message)
        }
      })

      const tick = async (): Promise<void> => {
        if (!monitorId || cancelled || pausedRef.current) return
        const r = await window.phosphor.monitor.sample(monitorId)
        if (cancelled) return
        if (r.ok) {
          everReady = true
          setStatus('ready')
          setSnap(r.data)
          setHistory((h) => [...h, r.data.cpuPercent].slice(-HISTORY))
        } else if (!everReady) {
          // Errore prima di avere mai dati: mostra lo stato d'errore.
          setStatus('error')
          setError(r.error)
        }
        // Errori transitori dopo il primo campione: si mantiene l'ultimo snapshot.
      }
      await tick()
      timer = window.setInterval(tick, POLL_MS)
    }
    start()

    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
      offStatus()
      if (monitorId) window.phosphor.monitor.close(monitorId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, attempt])

  if (status === 'connecting' && !snap) {
    return <CenterCard connection={connection} state="connecting" />
  }
  if (status === 'error' && !snap) {
    return (
      <CenterCard
        connection={connection}
        state="error"
        message={error}
        onRetry={() => {
          retryRef.current += 1
          setAttempt(retryRef.current)
        }}
      />
    )
  }
  if (!snap) return <CenterCard connection={connection} state="connecting" />

  const memDetail = `${formatBytesFromKb(snap.mem.usedKb)} / ${formatBytesFromKb(snap.mem.totalKb)}`
  const loadColors = snap.load.map((l) => loadColor((l / Math.max(1, snap.cores)) * 100))

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      {/* Intestazione host */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-matrix shadow-[0_0_8px_#5BF08A]" />
            <h2 className="font-display text-xl text-ink">{connection.name}</h2>
            <span className="font-mono text-[12px] text-ink-dim">
              {snap.host.hostname || connection.host}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-ink-dim">
            {snap.host.os} · {snap.cores} core · up {formatUptime(snap.uptimeSec)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
            <motion.span
              key={snap.at}
              initial={{ opacity: 1 }}
              animate={paused ? { opacity: 0.4 } : { opacity: [1, 0.3, 1] }}
              transition={{ duration: 0.6 }}
              className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-amber' : 'bg-phosphor shadow-glow-sm'}`}
            />
            {paused ? 'in pausa' : `live · ${(POLL_MS / 1000).toFixed(1)}s`}
          </div>
          <button
            onClick={() => setPaused((p) => !p)}
            className="rounded-md border border-line px-3 py-1.5 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/40 hover:text-phosphor"
          >
            {paused ? '▸ riprendi' : '❚❚ pausa'}
          </button>
          <button
            onClick={() => stopMonitor(undefined)}
            title="Interrompi il monitoraggio e chiudi la connessione"
            className="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 font-mono text-[11px] text-danger transition hover:bg-danger/20"
          >
            ■ stop
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* CPU */}
        <Card className="lg:col-span-1">
          <CardTitle>processore</CardTitle>
          <div className="flex flex-col items-center">
            <Gauge value={snap.cpuPercent} label="cpu" sublabel={`${snap.cores} core`} />
            <div className="mt-4 w-full">
              <Sparkline data={history} />
            </div>
          </div>
        </Card>

        {/* Memoria + carico */}
        <Card className="lg:col-span-1">
          <CardTitle>memoria</CardTitle>
          <div className="space-y-4">
            <MetricBar
              label="RAM"
              percent={snap.mem.percent}
              detail={memDetail}
              mono={`disp. ${formatBytesFromKb(snap.mem.availableKb)}`}
            />
            {snap.swap.totalKb > 0 && (
              <MetricBar
                label="Swap"
                percent={snap.swap.percent}
                detail={`${formatBytesFromKb(snap.swap.usedKb)} / ${formatBytesFromKb(snap.swap.totalKb)}`}
              />
            )}
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
                carico medio
              </div>
              <div className="grid grid-cols-3 gap-2">
                {snap.load.map((l, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-line bg-void/40 px-2 py-2 text-center"
                  >
                    <div
                      className="font-mono text-lg font-bold tabular-nums"
                      style={{ color: loadColors[i] }}
                    >
                      {l.toFixed(2)}
                    </div>
                    <div className="font-mono text-[10px] text-ink-faint">
                      {['1m', '5m', '15m'][i]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Dischi */}
        <Card className="lg:col-span-1">
          <CardTitle>archiviazione</CardTitle>
          <div className="space-y-3">
            {snap.disks.length === 0 && (
              <div className="font-mono text-[12px] text-ink-dim">Nessun disco rilevato.</div>
            )}
            {snap.disks.slice(0, 5).map((d) => (
              <MetricBar
                key={d.mount}
                label={d.mount}
                percent={d.percent}
                detail={`${formatBytesFromKb(d.usedKb)} / ${formatBytesFromKb(d.sizeKb)}`}
                mono={d.filesystem}
              />
            ))}
          </div>
        </Card>

        {/* Processi */}
        <Card className="lg:col-span-3">
          <CardTitle>processi · top per CPU</CardTitle>
          <div className="overflow-hidden rounded-md border border-line">
            <table className="w-full border-collapse font-mono text-[12px]">
              <thead>
                <tr className="bg-void/50 text-left text-ink-dim">
                  <th className="px-3 py-2 font-normal">comando</th>
                  <th className="w-24 px-3 py-2 text-right font-normal">cpu %</th>
                  <th className="w-24 px-3 py-2 text-right font-normal">mem %</th>
                </tr>
              </thead>
              <tbody>
                {snap.processes.map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="truncate px-3 py-1.5 text-ink">{p.command}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: loadColor(p.cpu) }}>
                      {p.cpu.toFixed(1)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-dim">
                      {p.mem.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }): JSX.Element {
  return (
    <SpotlightCard className={`rounded-xl border border-line bg-panel/60 ${className}`}>
      <div className="p-4">{children}</div>
    </SpotlightCard>
  )
}

function CardTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
      {children}
    </div>
  )
}

function CenterCard({
  connection,
  state,
  message,
  onRetry
}: {
  connection: Connection
  state: 'connecting' | 'error'
  message?: string
  onRetry?: () => void
}): JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center text-center"
      >
        <div className="relative mb-6 h-24 w-24">
          {state === 'connecting' &&
            [0, 0.6, 1.2].map((d) => (
              <span
                key={d}
                className="absolute inset-0 rounded-full border border-phosphor/40 animate-pulse-ring"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-full border ${
              state === 'error' ? 'border-danger/50 text-danger' : 'border-phosphor/40 text-phosphor text-glow'
            } text-2xl`}
          >
            {state === 'error' ? '×' : '◍'}
          </div>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink-dim">
          {state === 'error' ? 'monitor non disponibile' : 'lettura metriche'}
        </div>
        <div className="mt-1 font-mono text-base text-ink">{connection.name}</div>
        {state === 'error' && (
          <>
            <p className="mt-3 max-w-sm font-mono text-[12px] text-danger/90">{message}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="mt-4 rounded-md border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-xs text-phosphor transition hover:bg-phosphor/20"
              >
                riprova
              </button>
            )}
          </>
        )}
      </motion.div>
    </div>
  )
}

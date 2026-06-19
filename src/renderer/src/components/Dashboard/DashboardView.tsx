import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../../lib/store'
import SpotlightCard from '../ui/SpotlightCard'
import type { Connection, ConnectInput } from '@shared/types'

type PingState = 'checking' | 'up' | 'down'
interface Ping {
  state: PingState
  ms: number
}

const POLL_MS = 15000

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

export default function DashboardView(): JSX.Element {
  const { connections, panes, startSession, setView, setMonitorTarget, setSftpTarget, openEditor } =
    useStore()
  const [pings, setPings] = useState<Record<string, Ping>>({})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const checkAll = async (): Promise<void> => {
      const list = useStore.getState().connections
      setPings((prev) => {
        const next = { ...prev }
        list.forEach((c) => {
          next[c.id] = { state: 'checking', ms: prev[c.id]?.ms ?? -1 }
        })
        return next
      })
      await Promise.all(
        list.map(async (c) => {
          const res = await window.phosphor.net.ping(c.host, c.port)
          if (!mounted.current) return
          setPings((prev) => ({
            ...prev,
            [c.id]:
              res.ok && res.data.reachable
                ? { state: 'up', ms: res.data.ms }
                : { state: 'down', ms: -1 }
          }))
        })
      )
    }
    checkAll()
    const timer = window.setInterval(checkAll, POLL_MS)
    return () => {
      mounted.current = false
      window.clearInterval(timer)
    }
  }, [])

  const connect = (c: Connection): void => {
    startSession(inputFor(c), { connectionId: c.id, title: c.name, host: c.host, username: c.username })
    setView('terminal')
  }
  const monitor = (c: Connection): void => {
    setMonitorTarget(c.id)
    setView('monitor')
  }
  const files = (c: Connection): void => {
    setSftpTarget(c.id)
    setView('sftp')
  }

  const upCount = connections.filter((c) => pings[c.id]?.state === 'up').length
  const activeSessions = Object.values(panes).filter((p) => p.status === 'ready').length

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
            panoramica
          </div>
          <h1 className="font-display text-2xl text-ink">Le tue infrastrutture</h1>
        </div>
        <div className="flex gap-3 font-mono text-[11px]">
          <Stat label="connessioni" value={connections.length} />
          <Stat label="raggiungibili" value={upCount} accent="matrix" />
          <Stat label="sessioni attive" value={activeSessions} accent="phosphor" />
        </div>
      </motion.div>

      {connections.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-line bg-elev/60 text-2xl text-phosphor text-glow">
            ⊞
          </div>
          <h2 className="mb-2 font-display text-xl text-ink">Nessuna connessione</h2>
          <p className="mb-4 max-w-sm font-mono text-[13px] text-ink-dim">
            Crea la tua prima connessione per vederla qui con lo stato in tempo reale.
          </p>
          <button
            onClick={() => openEditor({ mode: 'new' })}
            className="rounded-md border border-phosphor/50 bg-phosphor/15 px-4 py-2 font-mono text-xs text-phosphor transition hover:bg-phosphor/25"
          >
            ＋ nuova connessione
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {connections.map((c) => {
            const ping = pings[c.id]
            return (
              <SpotlightCard
                key={c.id}
                className="rounded-xl border border-line bg-panel/60 transition-colors hover:border-phosphor/30"
              >
                <div className="flex h-full flex-col p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: c.color, boxShadow: `0 0 10px ${c.color}` }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-[16px] text-ink">{c.name}</div>
                      <div className="truncate font-mono text-[11px] text-ink-dim">
                        <span className="text-phosphor/80">{c.username}</span>@{c.host}:{c.port}
                      </div>
                    </div>
                    <StatusPill ping={ping} />
                  </div>

                  {c.description && (
                    <p className="mb-3 line-clamp-2 font-sans text-[12px] text-ink-dim">
                      {c.description}
                    </p>
                  )}

                  <div className="mt-auto grid grid-cols-3 gap-2 pt-2">
                    <Action label="collega" onClick={() => connect(c)} primary />
                    <Action label="monitor" onClick={() => monitor(c)} />
                    <Action label="file" onClick={() => files(c)} />
                  </div>
                </div>
              </SpotlightCard>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  accent
}: {
  label: string
  value: number
  accent?: 'matrix' | 'phosphor'
}): JSX.Element {
  const color = accent === 'matrix' ? 'text-matrix' : accent === 'phosphor' ? 'text-phosphor' : 'text-ink'
  return (
    <div className="rounded-lg border border-line bg-elev/60 px-3 py-2 text-center">
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-ink-dim">{label}</div>
    </div>
  )
}

function StatusPill({ ping }: { ping?: Ping }): JSX.Element {
  const state = ping?.state ?? 'checking'
  if (state === 'checking') {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-dim">
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-amber"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1 }}
        />
        verifica
      </span>
    )
  }
  if (state === 'down') {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" />
        offline
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] text-matrix">
      <span className="h-1.5 w-1.5 rounded-full bg-matrix shadow-[0_0_6px_#5BF08A]" />
      {ping?.ms ?? 0} ms
    </span>
  )
}

function Action({
  label,
  onClick,
  primary
}: {
  label: string
  onClick: () => void
  primary?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border py-1.5 font-mono text-[11px] transition hover:shadow-glow-sm ${
        primary
          ? 'border-phosphor/40 bg-phosphor/10 text-phosphor hover:bg-phosphor/20'
          : 'border-line text-ink-dim hover:border-phosphor/30 hover:text-phosphor'
      }`}
    >
      {label}
    </button>
  )
}

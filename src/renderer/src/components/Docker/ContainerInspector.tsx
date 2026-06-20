import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Connection, DockerContainer, DockerStats } from '@shared/types'
import { formatBytes, formatSince } from '../../lib/format'
import ContainerLogs from './ContainerLogs'
import ExecTerminal from './ExecTerminal'

type Tab = 'stats' | 'logs' | 'shell'

export default function ContainerInspector({
  connection,
  container,
  stats,
  onClose
}: {
  connection: Connection
  container: DockerContainer
  stats?: DockerStats
  onClose: () => void
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('stats')
  // Le schede log/shell restano montate dopo la prima apertura per non
  // interrompere stream e sessioni quando si cambia tab.
  const [mounted, setMounted] = useState<Set<Tab>>(new Set(['stats']))

  const open = (t: Tab): void => {
    setTab(t)
    setMounted((s) => new Set(s).add(t))
  }

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 520, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-l border-line bg-panel/60"
    >
      {/* Intestazione */}
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-display text-[15px] text-ink" title={container.name}>
            {container.name}
          </div>
          <div className="truncate font-mono text-[10px] text-ink-faint" title={container.id}>
            {container.id.slice(0, 12)} · {container.image}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-dim transition hover:border-danger/40 hover:text-danger"
        >
          ✕
        </button>
      </div>

      {/* Tab */}
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        {(['stats', 'logs', 'shell'] as const).map((t) => (
          <button
            key={t}
            onClick={() => open(t)}
            className={`relative rounded-md px-3 py-1.5 font-mono text-[11px] transition-colors ${
              tab === t ? 'text-phosphor' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {tab === t && (
              <motion.span
                layoutId="docker-inspector-tab"
                className="absolute inset-0 rounded-md border border-phosphor/40 bg-phosphor/10"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative">
              {t === 'stats' ? 'statistiche' : t === 'logs' ? 'log' : 'shell'}
            </span>
          </button>
        ))}
      </div>

      {/* Corpo */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0" style={{ display: tab === 'stats' ? 'block' : 'none' }}>
          <StatsPanel container={container} stats={stats} />
        </div>
        {mounted.has('logs') && (
          <div className="absolute inset-0" style={{ visibility: tab === 'logs' ? 'visible' : 'hidden' }}>
            <ContainerLogs connection={connection} container={container} active={tab === 'logs'} />
          </div>
        )}
        {mounted.has('shell') && (
          <div className="absolute inset-0" style={{ visibility: tab === 'shell' ? 'visible' : 'hidden' }}>
            <ExecTerminal connection={connection} container={container} active={tab === 'shell'} />
          </div>
        )}
      </div>
    </motion.aside>
  )
}

function StatsPanel({
  container,
  stats
}: {
  container: DockerContainer
  stats?: DockerStats
}): JSX.Element {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-4">
        <Field label="stato">{container.status || container.state}</Field>
        <Field label="creato">{formatSince(container.createdAt)} fa</Field>
        <Field label="comando">
          <span className="break-all">{container.command || '—'}</span>
        </Field>
        <Field label="porte">
          {container.ports.length === 0
            ? '—'
            : container.ports
                .map((p) => `${p.publicPort ? `${p.publicPort}→` : ''}${p.privatePort}/${p.protocol}`)
                .join('  ')}
        </Field>

        <div className="border-t border-line pt-4">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
            risorse · docker stats
          </div>
          {!stats ? (
            <div className="font-mono text-[12px] text-ink-faint">
              {container.state === 'running'
                ? 'in attesa di metriche…'
                : 'container non in esecuzione'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Metric label="CPU" value={`${stats.cpuPercent.toFixed(1)}%`} accent="#5EF6FF" />
              <Metric label="Memoria" value={`${stats.memPercent.toFixed(1)}%`} accent="#C792EA" />
              <Metric label="Mem usata" value={formatBytes(stats.memUsedBytes)} />
              <Metric label="Mem limite" value={formatBytes(stats.memLimitBytes)} />
              <Metric label="Net RX" value={formatBytes(stats.netRxBytes)} />
              <Metric label="Net TX" value={formatBytes(stats.netTxBytes)} />
              <Metric label="Block R" value={formatBytes(stats.blockReadBytes)} />
              <Metric label="Block W" value={formatBytes(stats.blockWriteBytes)} />
              <Metric label="PID" value={String(stats.pids)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">{label}</div>
      <div className="font-mono text-[12px] text-ink">{children}</div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent
}: {
  label: string
  value: string
  accent?: string
}): JSX.Element {
  return (
    <div className="rounded-lg border border-line bg-void/40 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div
        className="mt-0.5 font-mono text-[15px] font-bold tabular-nums"
        style={{ color: accent ?? 'rgb(var(--c-ink))' }}
      >
        {value}
      </div>
    </div>
  )
}

import { motion } from 'framer-motion'
import type { DockerContainer, DockerContainerAction, DockerState, DockerStats } from '@shared/types'
import { formatBytes } from '../../lib/format'

const STATE_STYLE: Record<DockerState, { dot: string; text: string }> = {
  running: { dot: 'bg-matrix shadow-[0_0_6px_#5BF08A]', text: 'text-matrix' },
  restarting: { dot: 'bg-amber animate-pulse', text: 'text-amber' },
  paused: { dot: 'bg-amber', text: 'text-amber' },
  created: { dot: 'bg-phosphor/70', text: 'text-phosphor' },
  exited: { dot: 'bg-ink-faint', text: 'text-ink-dim' },
  dead: { dot: 'bg-danger', text: 'text-danger' },
  removing: { dot: 'bg-danger animate-pulse', text: 'text-danger' },
  unknown: { dot: 'bg-ink-faint', text: 'text-ink-dim' }
}

function MiniBar({ percent, color }: { percent: number; color: string }): JSX.Element {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-void/60">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, percent)}%`, background: color, boxShadow: `0 0 5px ${color}` }}
      />
    </div>
  )
}

export default function ContainerRow({
  container,
  stats,
  busy,
  selected,
  onSelect,
  onAction
}: {
  container: DockerContainer
  stats?: DockerStats
  busy: boolean
  selected: boolean
  onSelect: () => void
  onAction: (action: DockerContainerAction, c: DockerContainer) => void
}): JSX.Element {
  const st = STATE_STYLE[container.state]
  const isRunning = container.state === 'running'
  const cpu = stats?.cpuPercent ?? 0
  const mem = stats?.memPercent ?? 0

  const act = (e: React.MouseEvent, action: DockerContainerAction): void => {
    e.stopPropagation()
    onAction(action, container)
  }

  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onSelect}
      className={`cursor-pointer border-t border-line transition-colors ${
        selected ? 'bg-phosphor/10' : 'hover:bg-elev/40'
      }`}
    >
      {/* Nome + immagine */}
      <td className="px-3 py-2">
        <div className="truncate font-medium text-ink" title={container.name}>
          {container.name}
        </div>
        <div className="truncate text-[10px] text-ink-faint" title={container.image}>
          {container.image}
        </div>
      </td>

      {/* Stato */}
      <td className="px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
          <span className={`text-[11px] ${st.text}`}>{container.state}</span>
        </span>
      </td>

      {/* Uptime / status grezzo */}
      <td className="px-3 py-2 text-[11px] text-ink-dim">
        <span className="truncate" title={container.status}>
          {container.status || '—'}
        </span>
      </td>

      {/* Porte */}
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {container.ports.length === 0 && <span className="text-[11px] text-ink-faint">—</span>}
          {container.ports.slice(0, 4).map((p, i) => (
            <span
              key={i}
              className="rounded border border-line px-1 py-0.5 text-[10px] text-ink-dim"
              title={`${p.ip ?? ''}${p.publicPort ? `:${p.publicPort}->` : ''}${p.privatePort}/${p.protocol}`}
            >
              {p.publicPort ? `${p.publicPort}→${p.privatePort}` : p.privatePort}
            </span>
          ))}
          {container.ports.length > 4 && (
            <span className="text-[10px] text-ink-faint">+{container.ports.length - 4}</span>
          )}
        </div>
      </td>

      {/* CPU / MEM */}
      <td className="px-3 py-2">
        {isRunning && stats ? (
          <div className="space-y-1.5">
            <div>
              <div className="mb-0.5 flex justify-between text-[10px] text-ink-dim">
                <span>cpu</span>
                <span className="tabular-nums">{cpu.toFixed(1)}%</span>
              </div>
              <MiniBar percent={cpu} color="#5EF6FF" />
            </div>
            <div>
              <div className="mb-0.5 flex justify-between text-[10px] text-ink-dim">
                <span>mem</span>
                <span className="tabular-nums" title={`${formatBytes(stats.memUsedBytes)} / ${formatBytes(stats.memLimitBytes)}`}>
                  {mem.toFixed(1)}%
                </span>
              </div>
              <MiniBar percent={mem} color="#C792EA" />
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-ink-faint">—</span>
        )}
      </td>

      {/* Azioni */}
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          {busy ? (
            <span className="font-mono text-[10px] text-amber">…</span>
          ) : (
            <>
              {isRunning ? (
                <>
                  <ActionBtn title="Stop" onClick={(e) => act(e, 'stop')}>
                    ■
                  </ActionBtn>
                  <ActionBtn title="Restart" onClick={(e) => act(e, 'restart')}>
                    ↻
                  </ActionBtn>
                </>
              ) : (
                <ActionBtn title="Start" tone="ok" onClick={(e) => act(e, 'start')}>
                  ▸
                </ActionBtn>
              )}
              <ActionBtn title="Rimuovi" tone="danger" onClick={(e) => act(e, 'remove')}>
                ✕
              </ActionBtn>
            </>
          )}
        </div>
      </td>
    </motion.tr>
  )
}

function ActionBtn({
  children,
  title,
  onClick,
  tone
}: {
  children: React.ReactNode
  title: string
  onClick: (e: React.MouseEvent) => void
  tone?: 'ok' | 'danger'
}): JSX.Element {
  const cls =
    tone === 'ok'
      ? 'hover:border-matrix/50 hover:text-matrix'
      : tone === 'danger'
        ? 'hover:border-danger/50 hover:text-danger'
        : 'hover:border-phosphor/40 hover:text-phosphor'
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-6 w-6 items-center justify-center rounded border border-line text-[11px] text-ink-dim transition ${cls}`}
    >
      {children}
    </button>
  )
}

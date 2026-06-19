import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../lib/store'
import type { TunnelConfig, TunnelStatus, TunnelType } from '@shared/types'

type TunnelRow = TunnelConfig & { active: boolean }

interface Draft {
  id?: string
  name: string
  connectionId: string
  type: TunnelType
  srcPort: string
  destHost: string
  destPort: string
}

const emptyDraft = (connectionId: string): Draft => ({
  name: '',
  connectionId,
  type: 'local',
  srcPort: '',
  destHost: '127.0.0.1',
  destPort: ''
})

export default function TunnelsView(): JSX.Element {
  const connections = useStore((s) => s.connections)
  const [tunnels, setTunnels] = useState<TunnelRow[]>([])
  const [statuses, setStatuses] = useState<Record<string, TunnelStatus>>({})
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    const res = await window.phosphor.tunnels.list()
    if (res.ok) {
      setTunnels(res.data)
      setStatuses((prev) => {
        const next = { ...prev }
        res.data.forEach((t) => {
          next[t.id] = next[t.id] ?? (t.active ? 'active' : 'inactive')
        })
        return next
      })
    }
  }

  useEffect(() => {
    load()
    const off = window.phosphor.tunnels.onStatus((e) => {
      setStatuses((prev) => ({ ...prev, [e.tunnelId]: e.status }))
      if (e.status === 'error' && e.message) setError(e.message)
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = async (t: TunnelRow): Promise<void> => {
    setError(null)
    const st = statuses[t.id] ?? 'inactive'
    if (st === 'active' || st === 'starting') {
      await window.phosphor.tunnels.stop(t.id)
      setStatuses((p) => ({ ...p, [t.id]: 'inactive' }))
    } else {
      setStatuses((p) => ({ ...p, [t.id]: 'starting' }))
      await window.phosphor.tunnels.start(t.id)
    }
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    if (!draft.name.trim() || !draft.connectionId || !draft.srcPort || !draft.destPort) {
      setError('Nome, connessione, porta sorgente e destinazione sono obbligatori.')
      return
    }
    const res = await window.phosphor.tunnels.upsert({
      id: draft.id,
      name: draft.name.trim(),
      connectionId: draft.connectionId,
      type: draft.type,
      srcPort: Number(draft.srcPort),
      destHost: draft.destHost.trim() || '127.0.0.1',
      destPort: Number(draft.destPort)
    })
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDraft(null)
    setError(null)
    load()
  }

  const remove = async (id: string): Promise<void> => {
    await window.phosphor.tunnels.remove(id)
    load()
  }

  const connName = (id: string): string => connections.find((c) => c.id === id)?.name ?? '—'

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
            port forwarding
          </div>
          <h1 className="font-display text-2xl text-ink">Tunnel SSH</h1>
        </div>
        <button
          onClick={() => setDraft(emptyDraft(connections[0]?.id ?? ''))}
          disabled={connections.length === 0}
          className="rounded-md border border-phosphor/50 bg-phosphor/15 px-4 py-2 font-mono text-xs text-phosphor transition hover:bg-phosphor/25 disabled:opacity-40"
        >
          ＋ nuovo tunnel
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[12px] text-danger">
          {error}
        </div>
      )}

      <AnimatePresence>
        {draft && (
          <TunnelEditor
            draft={draft}
            setDraft={setDraft}
            onSave={save}
            onCancel={() => {
              setDraft(null)
              setError(null)
            }}
          />
        )}
      </AnimatePresence>

      {tunnels.length === 0 && !draft ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-line bg-elev/60 text-2xl text-phosphor text-glow">
            ⇄
          </div>
          <h2 className="mb-2 font-display text-xl text-ink">Nessun tunnel</h2>
          <p className="max-w-md font-mono text-[13px] leading-relaxed text-ink-dim">
            Inoltra una porta locale verso un servizio raggiungibile dal server
            (es. <span className="text-phosphor">5432 → database interno</span>) e attivalo con un clic.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tunnels.map((t) => {
            const st = statuses[t.id] ?? 'inactive'
            return (
              <motion.div
                key={t.id}
                layout
                className="flex items-center gap-4 rounded-xl border border-line bg-panel/60 p-4"
              >
                <StatusLamp status={st} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-[15px] text-ink">{t.name}</span>
                    <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                      {t.type === 'local' ? 'locale' : 'remoto'}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-ink-dim">
                    {t.type === 'local' ? (
                      <>
                        <span className="text-phosphor">localhost:{t.srcPort}</span> →{' '}
                        {t.destHost}:{t.destPort} <span className="text-ink-faint">via {connName(t.connectionId)}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-phosphor">{connName(t.connectionId)}:{t.srcPort}</span> →{' '}
                        {t.destHost}:{t.destPort}
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setDraft({ ...t, srcPort: String(t.srcPort), destPort: String(t.destPort) })}
                  className="rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/30 hover:text-phosphor"
                >
                  ✎
                </button>
                <button
                  onClick={() => remove(t.id)}
                  className="rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink-dim transition hover:border-danger/40 hover:text-danger"
                >
                  ×
                </button>
                <ToggleSwitch active={st === 'active'} pending={st === 'starting'} onClick={() => toggle(t)} />
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusLamp({ status }: { status: TunnelStatus }): JSX.Element {
  const map = {
    active: 'bg-matrix shadow-[0_0_10px_#5BF08A]',
    starting: 'bg-amber animate-pulse',
    error: 'bg-danger shadow-[0_0_10px_#FF5C6A]',
    inactive: 'bg-ink-faint'
  }
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${map[status]}`} />
}

function ToggleSwitch({
  active,
  pending,
  onClick
}: {
  active: boolean
  pending: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={active ? 'Disattiva' : 'Attiva'}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
        active ? 'border-matrix/50 bg-matrix/25' : pending ? 'border-amber/50 bg-amber/20' : 'border-line bg-void/60'
      }`}
    >
      <motion.span
        layout
        className={`absolute top-0.5 h-4 w-4 rounded-full ${active ? 'bg-matrix' : pending ? 'bg-amber' : 'bg-ink-dim'}`}
        animate={{ left: active ? 22 : 2 }}
      />
    </button>
  )
}

function TunnelEditor({
  draft,
  setDraft,
  onSave,
  onCancel
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  onSave: () => void
  onCancel: () => void
}): JSX.Element {
  const connections = useStore((s) => s.connections)
  const input =
    'w-full rounded-md border border-line bg-void/60 px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-phosphor/50'
  const label = 'mb-1 block font-mono text-[10px] uppercase tracking-[0.22em] text-ink-dim'

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4 overflow-hidden rounded-xl border border-phosphor/40 bg-elev/70"
    >
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>nome</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="DB produzione"
              className={input}
            />
          </div>
          <div>
            <label className={label}>connessione (server)</label>
            <select
              value={draft.connectionId}
              onChange={(e) => setDraft({ ...draft, connectionId: e.target.value })}
              className={input}
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id} className="bg-panel">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={label}>tipo</label>
          <div className="flex gap-1.5">
            {(['local', 'remote'] as TunnelType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDraft({ ...draft, type: t })}
                className={`flex-1 rounded-md border py-1.5 font-mono text-[11px] transition ${
                  draft.type === t
                    ? 'border-phosphor/50 bg-phosphor/10 text-phosphor'
                    : 'border-line text-ink-dim hover:text-ink'
                }`}
              >
                {t === 'local' ? 'locale (localhost → server)' : 'remoto (server → locale)'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[90px,1fr,90px] items-end gap-3">
          <div>
            <label className={label}>porta {draft.type === 'local' ? 'locale' : 'remota'}</label>
            <input
              value={draft.srcPort}
              onChange={(e) => setDraft({ ...draft, srcPort: e.target.value.replace(/\D/g, '') })}
              placeholder="5432"
              className={input + ' font-mono'}
            />
          </div>
          <div>
            <label className={label}>host destinazione</label>
            <input
              value={draft.destHost}
              onChange={(e) => setDraft({ ...draft, destHost: e.target.value })}
              placeholder="127.0.0.1"
              className={input + ' font-mono'}
            />
          </div>
          <div>
            <label className={label}>porta dest.</label>
            <input
              value={draft.destPort}
              onChange={(e) => setDraft({ ...draft, destPort: e.target.value.replace(/\D/g, '') })}
              placeholder="5432"
              className={input + ' font-mono'}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="rounded-md border border-line px-3 py-1.5 font-mono text-[12px] text-ink-dim transition hover:text-ink"
          >
            annulla
          </button>
          <button
            onClick={onSave}
            className="rounded-md border border-phosphor/50 bg-phosphor/15 px-5 py-1.5 font-mono text-[12px] text-phosphor transition hover:bg-phosphor/25"
          >
            salva
          </button>
        </div>
      </div>
    </motion.div>
  )
}

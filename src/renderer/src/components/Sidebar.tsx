import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../lib/store'
import SpotlightCard from './ui/SpotlightCard'
import GlobalCommands from './GlobalCommands'
import type { Connection, ConnectInput } from '@shared/types'

function authLabel(c: Connection): string {
  if (c.authMethod === 'password') return c.hasStoredPassword ? 'password salvata' : 'password'
  if (c.authMethod === 'agent') return 'ssh-agent'
  if (c.hasStoredKey) return 'chiave salvata'
  if (c.keyPath) return 'chiave da file'
  return 'chiave richiesta'
}

export default function Sidebar(): JSX.Element {
  const {
    connections,
    openEditor,
    startSession,
    view,
    monitorTargetId,
    setMonitorTarget,
    sftpTargetId,
    setSftpTarget,
    sidebarSection,
    setSidebarSection
  } = useStore()
  const section = sidebarSection
  // Connessione "selezionata" e label dell'azione in base alla vista.
  const selectedId = view === 'monitor' ? monitorTargetId : view === 'sftp' ? sftpTargetId : undefined
  const actionLabel = view === 'monitor' ? 'monitora' : view === 'sftp' ? 'apri' : 'collega'
  const headerLabel =
    view === 'monitor' ? 'scegli un server' : view === 'sftp' ? 'scegli un server' : 'le tue destinazioni'

  const connect = (c: Connection): void => {
    const input: ConnectInput = {
      connectionId: c.id,
      host: c.host,
      port: c.port,
      username: c.username,
      authMethod: c.authMethod,
      keyPath: c.keyPath
    }
    startSession(input, {
      connectionId: c.id,
      title: c.name,
      host: c.host,
      username: c.username
    })
  }

  const primaryAction = (c: Connection): void => {
    if (view === 'monitor') setMonitorTarget(c.id)
    else if (view === 'sftp') setSftpTarget(c.id)
    else connect(c)
  }

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden border-r border-line bg-panel/40">
      {/* Switch sezione */}
      <div className="drag flex items-center gap-1 px-3 pb-2 pt-3">
        {(['connections', 'commands'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSidebarSection(key)}
            className={`no-drag relative flex-1 rounded-md py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
              section === key ? 'text-phosphor' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {section === key && (
              <motion.span
                layoutId="sidebar-section"
                className="absolute inset-0 rounded-md border border-phosphor/40 bg-phosphor/10"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative">{key === 'connections' ? 'connessioni' : 'comandi'}</span>
          </button>
        ))}
      </div>

      {section === 'commands' ? (
        <GlobalCommands />
      ) : (
        <ConnectionsList
          connections={connections}
          selectedId={selectedId}
          actionLabel={actionLabel}
          headerLabel={headerLabel}
          authLabel={authLabel}
          onPrimary={primaryAction}
          onEdit={(c) => openEditor({ mode: 'edit', connection: c })}
          onNew={() => openEditor({ mode: 'new' })}
        />
      )}
    </aside>
  )
}

interface ListProps {
  connections: Connection[]
  selectedId?: string
  actionLabel: string
  headerLabel: string
  authLabel: (c: Connection) => string
  onPrimary: (c: Connection) => void
  onEdit: (c: Connection) => void
  onNew: () => void
}

function ConnectionsList({
  connections,
  selectedId,
  actionLabel,
  headerLabel,
  authLabel,
  onPrimary,
  onEdit,
  onNew
}: ListProps): JSX.Element {
  return (
    <>
      <div className="flex items-center justify-between px-4 pb-2 pt-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
          {headerLabel}
        </div>
        <button
          onClick={onNew}
          title="Nuova connessione"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-phosphor/40 bg-phosphor/10 text-base text-phosphor transition hover:bg-phosphor/20 hover:shadow-glow-sm"
        >
          +
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {connections.length === 0 && (
          <div className="mt-10 px-3 text-center font-mono text-[12px] leading-relaxed text-ink-faint">
            Nessuna connessione salvata.
            <br />
            Premi <span className="text-phosphor">+</span> per crearne una.
          </div>
        )}
        <AnimatePresence initial={false}>
          {connections.map((c) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
            >
              <SpotlightCard className="rounded-lg border border-line bg-elev/70 transition-colors hover:border-phosphor/30">
                <div className="relative p-3">
                  <span
                    className="absolute left-0 top-3 h-[calc(100%-1.5rem)] w-[3px] rounded-full"
                    style={{ background: c.color, boxShadow: `0 0 10px ${c.color}` }}
                  />
                  <div className="pl-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-display text-[15px] text-ink">{c.name}</div>
                        {c.description && (
                          <div className="truncate font-sans text-[11px] text-ink-dim">
                            {c.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 truncate font-mono text-[11px] text-ink-dim">
                      <span className="text-phosphor/80">{c.username}</span>@{c.host}
                      <span className="text-ink-faint">:{c.port}</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                      {authLabel(c)}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => onPrimary(c)}
                        className={`flex-1 rounded-md border py-1.5 font-mono text-[11px] transition hover:shadow-glow-sm ${
                          selectedId === c.id
                            ? 'border-matrix/50 bg-matrix/15 text-matrix'
                            : 'border-phosphor/40 bg-phosphor/10 text-phosphor hover:bg-phosphor/20'
                        }`}
                      >
                        {selectedId === c.id ? '● selezionata' : actionLabel}
                      </button>
                      <button
                        onClick={() => onEdit(c)}
                        title="Modifica"
                        className="rounded-md border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/30 hover:text-phosphor"
                      >
                        ✎
                      </button>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}

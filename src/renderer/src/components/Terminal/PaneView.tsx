import { useStore, type Pane } from '../../lib/store'
import TerminalView from './TerminalView'
import ConnectingOverlay from './ConnectingOverlay'

interface Props {
  tabId: string
  pane: Pane
  isActivePane: boolean
  multi: boolean
}

/** Un singolo pannello della split view: terminale + comandi del pannello. */
export default function PaneView({ tabId, pane, isActivePane, multi }: Props): JSX.Element {
  const { setActivePane, splitPane, closePane, reconnectPane } = useStore()
  const busy =
    pane.status === 'connecting' || pane.status === 'authenticating' || pane.status === 'error'

  const color =
    useStore((s) => s.connections.find((c) => c.id === pane.connectionId)?.color) ?? '#5EF6FF'

  return (
    <div
      onMouseDown={() => multi && setActivePane(tabId, pane.id)}
      className="group/pane relative h-full w-full overflow-hidden"
    >
      {/* Bordo del pannello attivo (solo quando ce n'è più d'uno). */}
      {multi && (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-sm transition-all"
          style={{
            boxShadow: isActivePane
              ? `inset 0 0 0 1.5px ${color}`
              : 'inset 0 0 0 1px rgb(var(--c-line))',
            opacity: isActivePane ? 1 : 0.6
          }}
        />
      )}

      {/* Barra strumenti del pannello (in hover). */}
      {multi && (
        <div className="absolute right-1.5 top-1.5 z-20 hidden items-center gap-1 rounded-md border border-line bg-panel/90 px-1 py-0.5 backdrop-blur group-hover/pane:flex">
          <span className="px-1 font-mono text-[10px] text-ink-faint">{pane.host}</span>
        </div>
      )}

      {/* Strumenti split/chiudi (sempre disponibili in hover). */}
      <div className="absolute right-1.5 bottom-1.5 z-20 hidden items-center gap-1 rounded-md border border-line bg-panel/90 px-1 py-0.5 backdrop-blur group-hover/pane:flex">
        <PaneBtn title="Dividi a destra" onClick={() => splitPane(tabId, pane.id, 'row')}>
          ⬌
        </PaneBtn>
        <PaneBtn title="Dividi sotto" onClick={() => splitPane(tabId, pane.id, 'col')}>
          ⬍
        </PaneBtn>
        {multi && (
          <PaneBtn title="Chiudi pannello" danger onClick={() => closePane(tabId, pane.id)}>
            ×
          </PaneBtn>
        )}
      </div>

      {pane.sessionId && <TerminalView pane={pane} active={isActivePane} />}
      {busy && (
        <ConnectingOverlay
          pane={pane}
          onRetry={() => reconnectPane(pane.id)}
          onClose={() => closePane(tabId, pane.id)}
        />
      )}
    </div>
  )
}

function PaneBtn({
  children,
  title,
  onClick,
  danger
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  danger?: boolean
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex h-5 w-5 items-center justify-center rounded font-mono text-[11px] text-ink-dim transition hover:bg-elev ${
        danger ? 'hover:text-danger' : 'hover:text-phosphor'
      }`}
    >
      {children}
    </button>
  )
}

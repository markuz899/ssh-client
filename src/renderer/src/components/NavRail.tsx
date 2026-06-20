import { motion } from 'framer-motion'
import { useStore, type AppView } from '../lib/store'
import { useSettings } from '../lib/settings'

interface Item {
  view: AppView
  glyph: string
  label: string
}

const ITEMS: Item[] = [
  { view: 'dashboard', glyph: '⊞', label: 'Home' },
  { view: 'terminal', glyph: '⌁', label: 'Terminali' },
  { view: 'monitor', glyph: '◍', label: 'Monitor' },
  { view: 'sftp', glyph: '⇅', label: 'File' },
  { view: 'tunnels', glyph: '⇄', label: 'Tunnel' },
  { view: 'logs', glyph: '≣', label: 'Logs' },
  { view: 'docker', glyph: '❒', label: 'Docker' },
  { view: 'assistant', glyph: '✦', label: 'AI' }
]

export default function NavRail(): JSX.Element {
  const { view, setView, sidebarCollapsed, toggleSidebar } = useStore()
  const openSettings = useSettings((s) => s.setOpen)

  return (
    <nav className="flex w-[64px] shrink-0 flex-col items-center gap-2 border-r border-line bg-void/60 py-4">
      {ITEMS.map((item) => {
        const active = view === item.view
        return (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            title={item.label}
            className="group relative flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-lg transition-colors"
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-lg border border-phosphor/40 bg-phosphor/10 shadow-glow-sm"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span
              className={`relative text-xl transition-colors ${
                active ? 'text-phosphor text-glow' : 'text-ink-dim group-hover:text-ink'
              }`}
            >
              {item.glyph}
            </span>
            <span
              className={`relative font-mono text-[9px] uppercase tracking-wider transition-colors ${
                active ? 'text-phosphor' : 'text-ink-faint group-hover:text-ink-dim'
              }`}
            >
              {item.label}
            </span>
          </button>
        )
      })}

      <div className="mt-auto flex flex-col items-center gap-2">
        <RailButton
          onClick={toggleSidebar}
          title={sidebarCollapsed ? 'Espandi pannello' : 'Comprimi pannello'}
          glyph={sidebarCollapsed ? '»' : '«'}
        />
        <RailButton onClick={() => openSettings(true)} title="Impostazioni" glyph="⚙" />
      </div>
    </nav>
  )
}

function RailButton({
  onClick,
  title,
  glyph
}: {
  onClick: () => void
  title: string
  glyph: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-lg text-ink-dim transition hover:border-phosphor/30 hover:bg-phosphor/10 hover:text-phosphor"
    >
      {glyph}
    </button>
  )
}

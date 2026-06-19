import { useStore } from '../lib/store'

export default function TitleBar(): JSX.Element {
  const { tabs, encryptionAvailable } = useStore()
  const active = tabs.filter((t) => t.status === 'ready').length

  return (
    <header className="drag flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel/50 pl-[88px] pr-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-base text-phosphor text-glow">⌁</span>
        <span className="font-display text-[13px] font-bold tracking-wide text-ink">
          PHOSPHOR
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
          ssh
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4 font-mono text-[10px] text-ink-dim">
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              active > 0 ? 'bg-matrix shadow-[0_0_6px_#5BF08A]' : 'bg-ink-faint'
            }`}
          />
          {active} {active === 1 ? 'sessione attiva' : 'sessioni attive'}
        </span>
        <span
          className="flex items-center gap-1.5"
          title={
            encryptionAvailable
              ? 'I segreti sono cifrati dal portachiavi di sistema.'
              : 'Cifratura di sistema non disponibile: i segreti usano un fallback locale.'
          }
        >
          <span className={encryptionAvailable ? 'text-matrix' : 'text-amber'}>
            {encryptionAvailable ? '🔒' : '⚠'}
          </span>
          {encryptionAvailable ? 'keychain' : 'fallback'}
        </span>
      </div>
    </header>
  )
}

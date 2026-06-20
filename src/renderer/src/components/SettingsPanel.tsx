import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  useSettings,
  ACCENT_PRESETS,
  BACKGROUNDS,
  type BackgroundPreset
} from '../lib/settings'
import { ACTIONS, eventToCombo, formatCombo, type ActionId, type ActionMeta } from '../lib/shortcuts'
import AiSettingsSection from './Assistant/AiSettingsSection'

export default function SettingsPanel(): JSX.Element {
  const s = useSettings()
  const close = (): void => s.setOpen(false)

  return (
    <motion.div
      className="absolute inset-0 z-40 flex justify-end bg-void/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.div
        className="scanlines relative flex h-full w-[420px] flex-col border-l border-line bg-panel shadow-panel"
        initial={{ x: 60, opacity: 0.4 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
              aspetto
            </div>
            <div className="font-display text-lg text-ink">Impostazioni</div>
          </div>
          <button onClick={close} className="text-xl text-ink-dim transition hover:text-ink">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Accento */}
          <Section title="colore accento">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => s.update({ accent: c })}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    s.accent.toLowerCase() === c.toLowerCase()
                      ? 'scale-110 border-white'
                      : 'border-transparent'
                  }`}
                  style={{ background: c, boxShadow: s.accent === c ? `0 0 12px ${c}` : 'none' }}
                />
              ))}
              <ColorWell value={s.accent} onChange={(v) => s.update({ accent: v })} />
            </div>
          </Section>

          {/* Testo */}
          <Section title="colore testo">
            <div className="space-y-3">
              <Row label="Testo principale">
                <ColorWell value={s.ink} onChange={(v) => s.update({ ink: v })} withHex />
              </Row>
              <Row label="Testo secondario">
                <ColorWell value={s.inkDim} onChange={(v) => s.update({ inkDim: v })} withHex />
              </Row>
            </div>
          </Section>

          {/* Sfondo */}
          <Section title="sfondo">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(BACKGROUNDS) as BackgroundPreset[]).map((key) => {
                const bg = BACKGROUNDS[key]
                const active = s.background === key
                return (
                  <button
                    key={key}
                    onClick={() => s.update({ background: key })}
                    className={`rounded-lg border p-2 transition ${
                      active ? 'border-phosphor/60 shadow-glow-sm' : 'border-line hover:border-phosphor/30'
                    }`}
                  >
                    <div
                      className="mb-2 h-10 w-full rounded"
                      style={{
                        background: `rgb(${bg.void.join(',')})`,
                        boxShadow: `inset 0 0 0 1px rgb(${bg.elev.join(',')})`
                      }}
                    />
                    <div
                      className={`font-mono text-[11px] ${active ? 'text-phosphor' : 'text-ink-dim'}`}
                    >
                      {bg.label}
                    </div>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Terminale */}
          <Section title="terminale">
            <Row label={`Dimensione testo · ${s.terminalFontSize}px`}>
              <input
                type="range"
                min={10}
                max={18}
                value={s.terminalFontSize}
                onChange={(e) => s.update({ terminalFontSize: Number(e.target.value) })}
                className="w-40 accent-phosphor"
              />
            </Row>
            <p className="mt-1 font-mono text-[10px] text-ink-faint">
              Si applica ai terminali aperti da ora in poi.
            </p>
          </Section>

          {/* Assistente AI */}
          <Section title="assistente AI">
            <AiSettingsSection />
          </Section>

          {/* Scorciatoie */}
          <Section title="scorciatoie da tastiera">
            <ShortcutEditor />
          </Section>

          {/* Animazioni */}
          <Section title="animazioni">
            <Row label="Effetti e animazioni">
              <button
                onClick={() => s.update({ animations: !s.animations })}
                className={`relative h-6 w-11 rounded-full border transition ${
                  s.animations ? 'border-phosphor/50 bg-phosphor/20' : 'border-line bg-void/60'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
                    s.animations ? 'left-[22px] bg-phosphor' : 'left-0.5 bg-ink-dim'
                  }`}
                />
              </button>
            </Row>
          </Section>
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-4">
          <button
            onClick={s.reset}
            className="font-mono text-[12px] text-ink-dim transition hover:text-danger"
          >
            ripristina default
          </button>
          <button
            onClick={close}
            className="rounded-md border border-phosphor/50 bg-phosphor/15 px-5 py-2 font-mono text-[12px] text-phosphor transition hover:bg-phosphor/25"
          >
            fatto
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.28em] text-ink-dim">
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-sans text-[13px] text-ink">{label}</span>
      {children}
    </div>
  )
}

function ShortcutEditor(): JSX.Element {
  const shortcuts = useSettings((s) => s.shortcuts)
  const update = useSettings((s) => s.update)
  const [recording, setRecording] = useState<ActionId | null>(null)

  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const combo = eventToCombo(e)
      if (!combo) return // solo modificatori: continua ad ascoltare
      update({ shortcuts: { ...useSettings.getState().shortcuts, [recording]: combo } })
      setRecording(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, update])

  const groups: Record<string, ActionMeta[]> = {}
  ACTIONS.forEach((a) => {
    ;(groups[a.group] ??= []).push(a)
  })

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([group, actions]) => (
        <div key={group}>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            {group}
          </div>
          <div className="space-y-1.5">
            {actions.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3">
                <span className="font-sans text-[12px] text-ink">{a.label}</span>
                <button
                  onClick={() => setRecording((r) => (r === a.id ? null : a.id))}
                  className={`min-w-[88px] rounded-md border px-2.5 py-1 text-center font-mono text-[11px] transition ${
                    recording === a.id
                      ? 'animate-pulse border-phosphor/60 bg-phosphor/15 text-phosphor'
                      : 'border-line text-ink-dim hover:border-phosphor/30 hover:text-phosphor'
                  }`}
                >
                  {recording === a.id ? 'premi tasti…' : formatCombo(shortcuts[a.id])}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="font-mono text-[10px] leading-relaxed text-ink-faint">
        Clic su una scorciatoia, poi premi la combinazione. Esc annulla.
      </p>
    </div>
  )
}

function ColorWell({
  value,
  onChange,
  withHex = false
}: {
  value: string
  onChange: (v: string) => void
  withHex?: boolean
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <span
        className="block h-8 w-8 rounded-full border-2 border-white/20"
        style={{ background: value, boxShadow: `0 0 10px ${value}66` }}
      />
      {withHex && <span className="font-mono text-[11px] text-ink-dim">{value.toUpperCase()}</span>}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </label>
  )
}

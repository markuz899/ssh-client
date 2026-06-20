import { useState } from 'react'
import type { AiProviderId } from '@shared/types'
import { useAi } from '../../lib/aiStore'

export default function AiSettingsSection(): JSX.Element {
  const { settings, catalog, keyStatus, updateSettings, setKey, clearKey } = useAi()
  const info = useAi((s) => s.providerInfo())
  const [keyInput, setKeyInput] = useState('')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMsg, setTestMsg] = useState('')

  if (!settings) {
    return <p className="font-mono text-[11px] text-ink-faint">Caricamento…</p>
  }

  const hasKey = Boolean(keyStatus[settings.provider])

  const onProvider = (provider: AiProviderId): void => {
    const next = catalog.find((p) => p.id === provider)
    const model = next?.models[0]?.id ?? settings.model
    updateSettings({ provider, model })
    setKeyInput('')
    setTestState('idle')
  }

  const saveKey = async (): Promise<void> => {
    if (!keyInput.trim()) return
    await setKey(settings.provider, keyInput.trim())
    setKeyInput('')
  }

  const runTest = async (): Promise<void> => {
    setTestState('testing')
    setTestMsg('')
    const res = await window.phosphor.ai.test()
    if (res.ok) {
      setTestState('ok')
      setTestMsg('Connessione riuscita.')
    } else {
      setTestState('error')
      setTestMsg(res.error)
    }
  }

  return (
    <div className="space-y-4">
      {/* Provider */}
      <Field label="Provider">
        <select
          value={settings.provider}
          onChange={(e) => onProvider(e.target.value as AiProviderId)}
          className="w-full rounded-md border border-line bg-void/60 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
        >
          {catalog.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Modello (editabile con suggerimenti) */}
      <Field label="Modello">
        <input
          list="ai-model-suggestions"
          value={settings.model}
          onChange={(e) => updateSettings({ model: e.target.value })}
          placeholder="es. claude-opus-4-8"
          className="w-full rounded-md border border-line bg-void/60 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
        />
        <datalist id="ai-model-suggestions">
          {info?.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </datalist>
      </Field>

      {/* API key */}
      {info?.needsKey && (
        <Field label="API key">
          {hasKey ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 font-mono text-[11px] text-matrix">● chiave salvata (cifrata)</span>
              <button
                onClick={() => clearKey(settings.provider)}
                className="rounded-md border border-line px-2.5 py-1 font-mono text-[11px] text-ink-dim transition hover:border-danger/40 hover:text-danger"
              >
                rimuovi
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveKey()}
                placeholder="incolla la chiave…"
                className="min-w-0 flex-1 rounded-md border border-line bg-void/60 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
              />
              <button
                onClick={saveKey}
                disabled={!keyInput.trim()}
                className="rounded-md border border-phosphor/40 bg-phosphor/10 px-3 py-1.5 font-mono text-[11px] text-phosphor transition hover:bg-phosphor/20 disabled:opacity-40"
              >
                salva
              </button>
            </div>
          )}
          {info.keyHint && (
            <p className="mt-1 font-mono text-[10px] text-ink-faint">{info.keyHint}</p>
          )}
        </Field>
      )}

      {/* Base URL per provider compatibili */}
      {info?.customBaseUrl && (
        <Field label="Base URL">
          <input
            value={settings.baseUrl}
            onChange={(e) => updateSettings({ baseUrl: e.target.value })}
            placeholder="http://localhost:11434/v1"
            className="w-full rounded-md border border-line bg-void/60 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
          />
        </Field>
      )}

      {/* Temperatura */}
      {info?.supportsTemperature && (
        <Field label={`Temperatura · ${settings.temperature.toFixed(1)}`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.temperature}
            onChange={(e) => updateSettings({ temperature: Number(e.target.value) })}
            className="w-full accent-phosphor"
          />
        </Field>
      )}

      {/* Max token */}
      <Field label="Lunghezza max risposta (token)">
        <input
          type="number"
          min={256}
          max={8192}
          step={256}
          value={settings.maxTokens}
          onChange={(e) => updateSettings({ maxTokens: Number(e.target.value) || 2048 })}
          className="w-full rounded-md border border-line bg-void/60 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
        />
      </Field>

      {/* Istruzioni extra */}
      <Field label="Istruzioni aggiuntive (system prompt)">
        <textarea
          value={settings.systemPromptExtra}
          onChange={(e) => updateSettings({ systemPromptExtra: e.target.value })}
          rows={3}
          placeholder="es. Rispondi sempre con comandi compatibili con Debian 12."
          className="w-full resize-none rounded-md border border-line bg-void/60 px-2.5 py-2 font-sans text-[12px] text-ink outline-none focus:border-phosphor/50"
        />
      </Field>

      {/* Allega terminale di default */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-sans text-[13px] text-ink">Allega l’output del terminale</span>
        <button
          onClick={() => updateSettings({ autoIncludeTerminal: !settings.autoIncludeTerminal })}
          className={`relative h-6 w-11 rounded-full border transition ${
            settings.autoIncludeTerminal
              ? 'border-phosphor/50 bg-phosphor/20'
              : 'border-line bg-void/60'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
              settings.autoIncludeTerminal ? 'left-[22px] bg-phosphor' : 'left-0.5 bg-ink-dim'
            }`}
          />
        </button>
      </div>

      {/* Test */}
      <div className="flex items-center gap-2">
        <button
          onClick={runTest}
          disabled={testState === 'testing'}
          className="rounded-md border border-line px-3 py-1.5 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/40 hover:text-phosphor disabled:opacity-50"
        >
          {testState === 'testing' ? 'verifico…' : 'prova connessione'}
        </button>
        {testState === 'ok' && <span className="font-mono text-[11px] text-matrix">✓ {testMsg}</span>}
        {testState === 'error' && (
          <span className="font-mono text-[11px] text-danger">✕ {testMsg}</span>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="mb-1 font-mono text-[11px] text-ink-dim">{label}</div>
      {children}
    </div>
  )
}

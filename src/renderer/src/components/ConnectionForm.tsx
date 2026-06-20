import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../lib/store'
import type { AuthMethod, Connection, SavedCommand } from '@shared/types'

const COLORS = ['#5EF6FF', '#5BF08A', '#FFB347', '#C792EA', '#FF5C6A', '#5EA0F6']

interface KeyState {
  // Contenuto della chiave appena importata (non ancora salvato), se presente.
  content?: string
  path?: string
  // Nome file solo per display.
  fileName?: string
}

const uid = (): string => Math.random().toString(36).slice(2, 9)

export default function ConnectionForm(): JSX.Element {
  const { editor, openEditor, loadConnections } = useStore()
  const existing = editor.mode === 'edit' ? editor.connection : undefined

  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [host, setHost] = useState(existing?.host ?? '')
  const [port, setPort] = useState(String(existing?.port ?? 22))
  const [username, setUsername] = useState(existing?.username ?? '')
  const [authMethod, setAuthMethod] = useState<AuthMethod>(existing?.authMethod ?? 'key')
  const [keyState, setKeyState] = useState<KeyState>(
    existing?.keyPath ? { path: existing.keyPath, fileName: existing.keyPath.split('/').pop() } : {}
  )
  const [passphrase, setPassphrase] = useState('')
  const [password, setPassword] = useState('')
  const [startupCommand, setStartupCommand] = useState(existing?.startupCommand ?? '')
  const [color, setColor] = useState(existing?.color ?? COLORS[0])
  const [commands, setCommands] = useState<SavedCommand[]>(existing?.commands ?? [])
  const [quick, setQuick] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = (): void => openEditor({ mode: 'closed' })

  // Parsa una riga "ssh -i chiave.pem utente@host -p 2222".
  const applyQuick = (): void => {
    const line = quick.trim()
    if (!line) return
    const keyMatch = line.match(/-i\s+(\S+)/)
    if (keyMatch) {
      setKeyState({ path: keyMatch[1], fileName: keyMatch[1].split('/').pop() })
      setAuthMethod('key')
    }
    const portMatch = line.match(/-p\s+(\d+)/)
    if (portMatch) setPort(portMatch[1])
    const target = line.match(/(?:^|\s)([\w.-]+)@([\w.-]+)/)
    if (target) {
      setUsername(target[1])
      setHost(target[2])
      if (!name) setName(target[2])
    }
  }

  const pickKey = async (): Promise<void> => {
    const res = await window.phosphor.dialog.pickKey()
    if (res.ok && res.data) {
      setKeyState({
        content: res.data.content,
        path: res.data.path,
        fileName: res.data.path.split('/').pop()
      })
      setAuthMethod('key')
    }
  }

  const addCommand = (): void =>
    setCommands((c) => [...c, { id: uid(), label: 'Nuovo comando', command: '', runOnSend: true }])
  const updateCommand = (id: string, patch: Partial<SavedCommand>): void =>
    setCommands((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const removeCommand = (id: string): void => setCommands((c) => c.filter((x) => x.id !== id))

  const save = async (): Promise<void> => {
    setError(null)
    if (!name.trim() || !host.trim() || !username.trim()) {
      setError('Nome, host e utente sono obbligatori.')
      return
    }
    setSaving(true)
    const res = await window.phosphor.connections.upsert({
      id: existing?.id,
      name: name.trim(),
      description: description.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      authMethod,
      keyPath: keyState.content ? undefined : keyState.path,
      startupCommand: startupCommand.trim() || undefined,
      commands: commands.filter((c) => c.command.trim()),
      color,
      // Salva la chiave cifrata solo se l'utente ha scelto di importarne il contenuto.
      privateKey: keyState.content,
      passphrase: passphrase || undefined,
      password: password || undefined
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await loadConnections()
    close()
  }

  const remove = async (): Promise<void> => {
    if (!existing) return
    await window.phosphor.connections.remove(existing.id)
    await loadConnections()
    close()
  }

  return (
    <motion.div
      className="absolute inset-0 z-30 flex justify-end bg-void/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.div
        className="scanlines relative flex h-full w-[460px] flex-col border-l border-line bg-panel shadow-panel"
        initial={{ x: 60, opacity: 0.4 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
              {existing ? 'modifica' : 'nuova connessione'}
            </div>
            <div className="font-display text-lg text-ink">
              {existing ? existing.name : 'Configura destinazione'}
            </div>
          </div>
          <button onClick={close} className="text-xl text-ink-dim transition hover:text-ink">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Quick parse */}
          {!existing && (
            <div>
              <Label hint="incolla un comando ssh e compilo io i campi">parse rapido</Label>
              <div className="flex gap-2">
                <input
                  value={quick}
                  onChange={(e) => setQuick(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyQuick()}
                  placeholder="ssh -i deploy.pem deploy@203.0.113.10"
                  className={inputCls + ' flex-1 font-mono'}
                />
                <button onClick={applyQuick} className={ghostBtn}>
                  ⮐
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="nome" full={false}>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="web-prod" />
            </Field>
            <Field label="colore" full={false}>
              <div className="flex items-center gap-1.5 pt-1">
                {COLORS.map((col) => (
                  <button
                    key={col}
                    onClick={() => setColor(col)}
                    className={`h-6 w-6 rounded-full border-2 transition ${
                      color === col ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ background: col, boxShadow: color === col ? `0 0 10px ${col}` : 'none' }}
                  />
                ))}
              </div>
            </Field>
          </div>

          <Field label="descrizione">
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Server di produzione web" />
          </Field>

          <div className="grid grid-cols-[1fr,90px] gap-3">
            <Field label="host / ip">
              <input value={host} onChange={(e) => setHost(e.target.value)} className={inputCls + ' font-mono'} placeholder="203.0.113.10" />
            </Field>
            <Field label="porta">
              <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} className={inputCls + ' font-mono'} placeholder="22" />
            </Field>
          </div>

          <Field label="utente">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls + ' font-mono'} placeholder="deploy" />
          </Field>

          {/* Metodo di autenticazione */}
          <Field label="autenticazione">
            <div className="flex gap-1.5">
              {(['key', 'password', 'agent'] as AuthMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setAuthMethod(m)}
                  className={`flex-1 rounded-md border py-1.5 font-mono text-[11px] transition ${
                    authMethod === m
                      ? 'border-phosphor/50 bg-phosphor/10 text-phosphor'
                      : 'border-line text-ink-dim hover:text-ink'
                  }`}
                >
                  {m === 'key' ? 'chiave' : m === 'password' ? 'password' : 'ssh-agent'}
                </button>
              ))}
            </div>
          </Field>

          {authMethod === 'key' && (
            <div className="space-y-3 rounded-lg border border-line bg-elev/50 p-3">
              <div className="flex items-center gap-2">
                <button onClick={pickKey} className={ghostBtn + ' flex-1'}>
                  {keyState.fileName ? '↻ cambia chiave' : '＋ seleziona .pem'}
                </button>
              </div>
              {keyState.fileName && (
                <div className="flex items-center justify-between rounded-md bg-void/60 px-3 py-2 font-mono text-[11px]">
                  <span className="truncate text-phosphor">🔑 {keyState.fileName}</span>
                  <span className="text-ink-faint">
                    {keyState.content
                      ? 'verrà salvata cifrata'
                      : existing?.hasStoredKey
                        ? 'salvata'
                        : 'da file'}
                  </span>
                </div>
              )}
              <Field label="passphrase (opzionale)">
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className={inputCls + ' font-mono'}
                  placeholder={existing?.hasStoredPassphrase ? '•••••• (salvata)' : 'se la chiave è protetta'}
                />
              </Field>
            </div>
          )}

          {authMethod === 'password' && (
            <Field label="password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls + ' font-mono'}
                placeholder={existing?.hasStoredPassword ? '•••••• (salvata)' : 'verrà salvata cifrata'}
              />
            </Field>
          )}

          <Field label="comando all'avvio (opzionale)">
            <input
              value={startupCommand}
              onChange={(e) => setStartupCommand(e.target.value)}
              className={inputCls + ' font-mono'}
              placeholder="cd /var/www/app && ls"
            />
          </Field>

          {/* Comandi salvati */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label hint="clic per inviarli al terminale, Alt+clic per non eseguirli">comandi salvati</Label>
              <button onClick={addCommand} className="font-mono text-[11px] text-phosphor hover:text-glow">
                ＋ aggiungi
              </button>
            </div>
            <div className="space-y-2">
              {commands.map((cmd) => (
                <div key={cmd.id} className="rounded-md border border-line bg-elev/50 p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <input
                      value={cmd.label}
                      onChange={(e) => updateCommand(cmd.id, { label: e.target.value })}
                      className={inputCls + ' flex-1 py-1 text-[12px]'}
                      placeholder="etichetta"
                    />
                    <button
                      onClick={() => removeCommand(cmd.id)}
                      className="px-1 text-ink-faint transition hover:text-danger"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    value={cmd.command}
                    onChange={(e) => updateCommand(cmd.id, { command: e.target.value })}
                    className={inputCls + ' font-mono py-1 text-[12px]'}
                    placeholder="sudo systemctl status nginx"
                  />
                  <label className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-ink-dim">
                    <input
                      type="checkbox"
                      checked={cmd.runOnSend}
                      onChange={(e) => updateCommand(cmd.id, { runOnSend: e.target.checked })}
                      className="accent-phosphor"
                    />
                    esegui subito (premi Invio)
                  </label>
                </div>
              ))}
              {commands.length === 0 && (
                <div className="rounded-md border border-dashed border-line px-3 py-3 text-center font-mono text-[11px] text-ink-faint">
                  Nessun comando. Aggiungine per averli a portata di clic.
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[12px] text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-5 py-4">
          {existing && (
            <button onClick={remove} className="font-mono text-[12px] text-danger/80 transition hover:text-danger">
              elimina
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={close} className={ghostBtn}>
              annulla
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md border border-phosphor/50 bg-phosphor/15 px-5 py-2 font-mono text-[12px] text-phosphor transition hover:bg-phosphor/25 hover:shadow-glow-sm disabled:opacity-50"
            >
              {saving ? 'salvataggio…' : 'salva'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

const inputCls =
  'w-full rounded-md border border-line bg-void/60 px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-phosphor/50 focus:shadow-glow-sm'
const ghostBtn =
  'rounded-md border border-line px-3 py-2 font-mono text-[12px] text-ink-dim transition hover:border-phosphor/40 hover:text-phosphor'

function Label({ children, hint }: { children: React.ReactNode; hint?: string }): JSX.Element {
  return (
    <div className="mb-1.5 flex items-baseline gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-dim">
        {children}
      </span>
      {hint && <span className="font-sans text-[10px] text-ink-faint">{hint}</span>}
    </div>
  )
}

function Field({
  label,
  children,
  full = true
}: {
  label: string
  children: React.ReactNode
  full?: boolean
}): JSX.Element {
  return (
    <div className={full ? '' : ''}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

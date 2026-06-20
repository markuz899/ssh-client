import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { AiContext, Connection, ConnectInput } from '@shared/types'
import { useStore } from '../../lib/store'
import { useAi } from '../../lib/aiStore'
import { useAiChat } from '../../lib/aiChat'
import { useSettings } from '../../lib/settings'
import { getTerminalTail } from '../../lib/terminalCapture'
import { formatBytesFromKb, formatUptime } from '../../lib/format'
import MessageItem from './MessageItem'
import ConversationList from './ConversationList'

function inputFor(c: Connection): ConnectInput {
  return {
    connectionId: c.id,
    host: c.host,
    port: c.port,
    username: c.username,
    authMethod: c.authMethod,
    keyPath: c.keyPath
  }
}

async function fetchMetrics(conn: Connection): Promise<string | undefined> {
  const open = await window.phosphor.monitor.open(inputFor(conn))
  if (!open.ok) return undefined
  const id = open.data.monitorId
  try {
    const r = await window.phosphor.monitor.sample(id)
    if (!r.ok) return undefined
    const s = r.data
    return [
      `CPU: ${s.cpuPercent}% su ${s.cores} core`,
      `RAM: ${formatBytesFromKb(s.mem.usedKb)} / ${formatBytesFromKb(s.mem.totalKb)} (${s.mem.percent}%)`,
      `Carico medio (1/5/15m): ${s.load.join('  ')}`,
      `Uptime: ${formatUptime(s.uptimeSec)}`,
      'Dischi: ' + (s.disks.map((d) => `${d.mount} ${d.percent}%`).join('  ') || 'n/d'),
      'Top processi: ' + s.processes.slice(0, 5).map((p) => `${p.command} ${p.cpu}%`).join(', ')
    ].join('\n')
  } catch {
    return undefined
  } finally {
    window.phosphor.monitor.close(id)
  }
}

const STARTERS = [
  'Spiega l’ultimo errore mostrato nel terminale',
  'Riassumi cosa sta succedendo su questo server',
  'Genera un comando per trovare i file più grandi in /var',
  'Perché il container Docker continua a riavviarsi?'
]

export default function AssistantView(): JSX.Element {
  const { connections, tabs, panes, activeTabId } = useStore()
  const settings = useAi((s) => s.settings)
  const ready = useAi((s) => s.isReady())
  const info = useAi((s) => s.providerInfo())
  const {
    conversations,
    activeId,
    inflight,
    send,
    cancelActive,
    newChat,
    selectChat,
    deleteChat,
    renameChat
  } = useAiChat()
  const openSettings = useSettings((s) => s.setOpen)

  const active = conversations.find((c) => c.id === activeId)
  const messages = active?.messages ?? []
  const streamingIds = new Set(Object.values(inflight))
  const streaming = activeId ? streamingIds.has(activeId) : false

  const tab = tabs.find((t) => t.id === activeTabId)
  const pane = tab ? panes[tab.activePaneId] : undefined
  const sessionId = pane?.sessionId
  const conn = connections.find((c) => c.id === pane?.connectionId)
  const hasSession = Boolean(sessionId)

  const [text, setText] = useState('')
  const [includeTerminal, setIncludeTerminal] = useState(true)
  const [includeMetrics, setIncludeMetrics] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (settings) setIncludeTerminal(settings.autoIncludeTerminal && hasSession)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.autoIncludeTerminal, hasSession])

  const lastContent = messages[messages.length - 1]?.content
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [activeId, messages.length, lastContent])

  const submit = async (raw?: string): Promise<void> => {
    const value = (raw ?? text).trim()
    if (!value || streaming || preparing || !ready) return
    setText('')

    const ctx: AiContext = {}
    if (conn) {
      ctx.connectionName = conn.name
      ctx.host = conn.host
      ctx.username = conn.username
    } else if (pane) {
      ctx.host = pane.host
      ctx.username = pane.username
    }
    if (includeTerminal && sessionId) ctx.terminalTail = getTerminalTail(sessionId)
    if (includeMetrics && conn) {
      setPreparing(true)
      ctx.metrics = await fetchMetrics(conn)
      setPreparing(false)
    }
    await send(value, ctx)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        streamingIds={streamingIds}
        onSelect={selectChat}
        onNew={newChat}
        onDelete={deleteChat}
        onRename={renameChat}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Intestazione */}
        <div className="flex items-center justify-between gap-3 border-b border-line bg-panel/50 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-phosphor/40 bg-phosphor/10 text-lg text-phosphor text-glow">
              ✦
            </div>
            <div>
              <h2 className="font-display text-lg text-ink">
                {active?.title || 'Assistente AI'}
              </h2>
              <div className="font-mono text-[11px] text-ink-dim">
                {info ? info.label : 'provider non configurato'}
                {settings?.model && <span className="text-ink-faint"> · {settings.model}</span>}
              </div>
            </div>
          </div>
          <button
            onClick={() => openSettings(true)}
            className="rounded-md border border-line px-3 py-1.5 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/40 hover:text-phosphor"
          >
            ⚙ configura
          </button>
        </div>

        {/* Corpo conversazione */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-xl border border-line bg-elev/60 text-2xl text-phosphor text-glow">
                ✦
              </div>
              <h3 className="mb-2 font-display text-xl text-ink">Come posso aiutarti?</h3>
              <p className="mb-6 max-w-md font-mono text-[12px] leading-relaxed text-ink-dim">
                Analizzo l’output del terminale, spiego errori e genero comandi Linux, Docker e
                Kubernetes. {hasSession
                  ? 'Userò il contesto della sessione attiva.'
                  : 'Apri un terminale per darmi contesto sul server.'}
              </p>
              {ready ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="rounded-full border border-line bg-elev/50 px-3 py-1.5 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/40 hover:text-phosphor"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => openSettings(true)}
                  className="rounded-md border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-[12px] text-phosphor transition hover:bg-phosphor/20"
                >
                  Configura un provider e una API key
                </button>
              )}
            </motion.div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m) => (
              <MessageItem key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-line bg-panel/50 px-5 py-3">
        <div className="mx-auto max-w-3xl">
          {!ready && (
            <div className="mb-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-1.5 font-mono text-[11px] text-amber">
              {info?.needsKey
                ? `Nessuna API key per ${info.label}. Aprila in “configura”.`
                : 'Provider AI non configurato.'}
            </div>
          )}
          <div className="flex items-center gap-2 pb-2">
            <ContextChip
              active={includeTerminal}
              disabled={!hasSession}
              onClick={() => setIncludeTerminal((v) => !v)}
              title={hasSession ? 'Allega output del terminale attivo' : 'Nessuna sessione attiva'}
            >
              ⌁ terminale
            </ContextChip>
            <ContextChip
              active={includeMetrics}
              disabled={!conn}
              onClick={() => setIncludeMetrics((v) => !v)}
              title={conn ? 'Allega metriche del server (CPU, RAM…)' : 'Serve una connessione salvata'}
            >
              ◍ metriche
            </ContextChip>
            {preparing && (
              <span className="font-mono text-[10px] text-ink-faint">raccolgo metriche…</span>
            )}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={ready ? 'Chiedi qualcosa o descrivi un problema…' : 'Configura un provider per iniziare'}
              disabled={!ready}
              className="max-h-40 min-h-[42px] flex-1 resize-none rounded-lg border border-line bg-void/60 px-3 py-2.5 font-sans text-[13px] text-ink outline-none transition placeholder:text-ink-faint focus:border-phosphor/50 disabled:opacity-50"
            />
            {streaming || preparing ? (
              <button
                onClick={cancelActive}
                className="flex h-[42px] items-center rounded-lg border border-danger/40 bg-danger/10 px-4 font-mono text-[12px] text-danger transition hover:bg-danger/20"
              >
                ■ stop
              </button>
            ) : (
              <button
                onClick={() => submit()}
                disabled={!ready || !text.trim()}
                className="flex h-[42px] items-center rounded-lg border border-phosphor/40 bg-phosphor/10 px-4 font-mono text-[12px] text-phosphor transition hover:bg-phosphor/20 disabled:opacity-40"
              >
                ▸ invia
              </button>
            )}
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-ink-faint">
            Invio per inviare · Shift+Invio per andare a capo
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

function ContextChip({
  children,
  active,
  disabled,
  onClick,
  title
}: {
  children: React.ReactNode
  active: boolean
  disabled?: boolean
  onClick: () => void
  title?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-full border px-2.5 py-1 font-mono text-[10px] transition disabled:opacity-30 ${
        active && !disabled
          ? 'border-phosphor/50 bg-phosphor/15 text-phosphor'
          : 'border-line text-ink-dim hover:border-phosphor/30 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

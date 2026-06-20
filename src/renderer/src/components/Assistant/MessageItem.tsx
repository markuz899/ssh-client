import { useState } from 'react'
import { useStore } from '../../lib/store'
import type { ChatMessage } from '../../lib/aiChat'

export default function MessageItem({ message }: { message: ChatMessage }): JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-xl border px-4 py-3 ${
          isUser
            ? 'border-phosphor/30 bg-phosphor/10'
            : 'border-line bg-elev/50'
        }`}
      >
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            <span className="text-phosphor">✦</span> assistente
          </div>
        )}
        <div className="space-y-2 text-[13px] leading-relaxed text-ink">
          {renderContent(message.content)}
          {message.streaming && message.content === '' && (
            <span className="inline-flex items-center gap-1 font-mono text-[12px] text-ink-dim">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-phosphor" /> sto pensando…
            </span>
          )}
          {message.streaming && message.content !== '' && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-phosphor/70 align-middle" />
          )}
        </div>
        {message.error && (
          <div className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5 font-mono text-[11px] text-danger">
            {message.error}
          </div>
        )}
      </div>
    </div>
  )
}

/** Spezza il testo sui recinti ``` distinguendo blocchi di codice e prosa. */
function renderContent(text: string): React.ReactNode[] {
  if (!text) return []
  const parts = text.split('```')
  return parts.map((seg, i) => {
    if (i % 2 === 1) {
      // Blocco di codice: la prima riga può essere il linguaggio.
      let code = seg
      const nl = seg.indexOf('\n')
      if (nl !== -1) {
        const first = seg.slice(0, nl).trim()
        if (/^[a-zA-Z0-9_+-]{0,16}$/.test(first)) code = seg.slice(nl + 1)
      }
      return <CodeBlock key={i} code={code.replace(/\n+$/, '')} />
    }
    return <TextSegment key={i} text={seg} />
  })
}

function TextSegment({ text }: { text: string }): JSX.Element | null {
  if (!text) return null
  // Evidenzia il codice inline `così`.
  const parts = text.split('`')
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="rounded bg-void/60 px-1 py-0.5 font-mono text-[12px] text-phosphor"
          >
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  )
}

function CodeBlock({ code }: { code: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [inserted, setInserted] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const insert = (): void => {
    const ok = useStore.getState().injectToActive(code, false)
    if (ok) {
      useStore.getState().setView('terminal')
      setInserted(true)
      setTimeout(() => setInserted(false), 1500)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-[#070C16]">
      <div className="flex items-center justify-between border-b border-line bg-void/50 px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">shell</span>
        <div className="flex items-center gap-1">
          <CodeBtn onClick={insert} title="Inserisci nel terminale attivo">
            {inserted ? '✓ inserito' : '↳ inserisci'}
          </CodeBtn>
          <CodeBtn onClick={copy} title="Copia">
            {copied ? '✓ copiato' : '⧉ copia'}
          </CodeBtn>
        </div>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">
        {code}
      </pre>
    </div>
  )
}

function CodeBtn({
  children,
  onClick,
  title
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-dim transition hover:border-phosphor/40 hover:text-phosphor"
    >
      {children}
    </button>
  )
}

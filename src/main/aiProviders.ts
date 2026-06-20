import Anthropic from '@anthropic-ai/sdk'
import type { AiMessage, AiProviderId, AiProviderInfo } from '../shared/types'

// Catalogo dei provider supportati. I modelli sono suggerimenti: il campo
// modello nelle impostazioni resta editabile per usare ID più recenti.
export const PROVIDERS: AiProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    needsKey: true,
    customBaseUrl: false,
    keyHint: 'console.anthropic.com → API Keys',
    supportsTemperature: false,
    models: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (più capace)' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (equilibrato)' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (veloce)' }
    ]
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    needsKey: true,
    customBaseUrl: false,
    keyHint: 'platform.openai.com → API Keys',
    supportsTemperature: true,
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
      { id: 'o4-mini', label: 'o4-mini (reasoning)' }
    ]
  },
  {
    id: 'google',
    label: 'Google (Gemini)',
    needsKey: true,
    customBaseUrl: false,
    keyHint: 'aistudio.google.com → API Keys',
    supportsTemperature: true,
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' }
    ]
  },
  {
    id: 'openai-compatible',
    label: 'Locale / compatibile OpenAI',
    needsKey: false,
    customBaseUrl: true,
    keyHint: 'Es. Ollama (http://localhost:11434/v1) o LM Studio',
    supportsTemperature: true,
    models: [
      { id: 'llama3.1', label: 'Llama 3.1 (Ollama)' },
      { id: 'qwen2.5', label: 'Qwen 2.5 (Ollama)' },
      { id: 'mistral', label: 'Mistral (Ollama)' }
    ]
  }
]

export function providerInfo(id: AiProviderId): AiProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

export interface StreamOptions {
  apiKey: string
  model: string
  maxTokens: number
  temperature: number
  baseUrl?: string
  system: string
  messages: AiMessage[]
}

// Errore "tipato" così che l'orchestratore possa distinguere l'annullamento.
export class AiAbortError extends Error {}

function ensureNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new AiAbortError('Richiesta annullata.')
}

// ---- Anthropic (SDK ufficiale) ----

async function* streamAnthropic(
  opts: StreamOptions,
  signal: AbortSignal
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey: opts.apiKey })
  // Niente temperatura: Opus 4.8/4.7 la rifiutano (400). Lo streaming evita i
  // timeout HTTP su risposte lunghe. `thinking` omesso = risposta diretta.
  const stream = client.messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content }))
    },
    { signal }
  )
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// ---- OpenAI / compatibile (fetch + SSE) ----

async function* streamOpenAI(
  opts: StreamOptions,
  signal: AbortSignal,
  defaultBase: string
): AsyncGenerator<string> {
  const base = (opts.baseUrl || defaultBase).replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [{ role: 'system', content: opts.system }, ...opts.messages]
    })
  })
  if (!res.ok || !res.body) {
    throw new Error(await errorText(res))
  }

  for await (const data of sseLines(res.body, signal)) {
    if (data === '[DONE]') return
    try {
      const json = JSON.parse(data)
      const delta = json.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) yield delta
    } catch {
      /* riga non-JSON (commento keep-alive): ignora */
    }
  }
}

// ---- Google Gemini (fetch + SSE) ----

async function* streamGoogle(
  opts: StreamOptions,
  signal: AbortSignal
): AsyncGenerator<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}` +
    `:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey)}`
  const contents = opts.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: opts.system }] },
      generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens }
    })
  })
  if (!res.ok || !res.body) {
    throw new Error(await errorText(res))
  }

  for await (const data of sseLines(res.body, signal)) {
    try {
      const json = JSON.parse(data)
      const parts = json.candidates?.[0]?.content?.parts
      if (Array.isArray(parts)) {
        for (const p of parts) if (typeof p.text === 'string') yield p.text
      }
    } catch {
      /* ignora frammenti non interpretabili */
    }
  }
}

// ---- Helper condivisi ----

/** Estrae i payload `data:` da uno stream SSE. */
async function* sseLines(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      ensureNotAborted(signal)
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (line.startsWith('data:')) yield line.slice(5).trim()
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      /* ignore */
    }
  }
}

async function errorText(res: Response): Promise<string> {
  let detail = ''
  try {
    const body = await res.text()
    const json = JSON.parse(body)
    detail = json.error?.message || json.error?.toString?.() || body
  } catch {
    /* corpo non leggibile */
  }
  const base = `Errore ${res.status} dal provider`
  return detail ? `${base}: ${detail.slice(0, 300)}` : `${base}.`
}

const OPENAI_BASE = 'https://api.openai.com/v1'

/** Dispatch al provider giusto, restituendo un generatore di delta testuali. */
export function streamChat(
  provider: AiProviderId,
  opts: StreamOptions,
  signal: AbortSignal
): AsyncGenerator<string> {
  switch (provider) {
    case 'anthropic':
      return streamAnthropic(opts, signal)
    case 'openai':
      return streamOpenAI(opts, signal, OPENAI_BASE)
    case 'openai-compatible':
      return streamOpenAI(opts, signal, OPENAI_BASE)
    case 'google':
      return streamGoogle(opts, signal)
    default:
      throw new Error(`Provider non supportato: ${provider}`)
  }
}

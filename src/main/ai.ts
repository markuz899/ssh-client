import type { AiContext, AiMessage } from '../shared/types'
import { getAiSettings, getAiKey } from './store'
import { AiAbortError, providerInfo, streamChat, type StreamOptions } from './aiProviders'

type EmitDelta = (requestId: string, text: string) => void
type EmitDone = (requestId: string) => void
type EmitError = (requestId: string, error: string) => void

// Controller di annullamento per ogni richiesta in corso.
const inflight = new Map<string, AbortController>()

const BASE_SYSTEM = [
  "Sei l'assistente AI integrato in AetherSSH, un client SSH desktop.",
  "Aiuti l'utente ad amministrare server remoti Linux: analizzi l'output del",
  'terminale, spieghi gli errori, generi comandi Linux, Docker e Kubernetes a',
  'partire dal linguaggio naturale e proponi soluzioni di troubleshooting.',
  'Linee guida:',
  '- Rispondi in italiano, in modo conciso e concreto.',
  '- Quando proponi comandi, racchiudili in blocchi di codice ``` così che',
  "  l'utente possa eseguirli con un clic. Un comando per blocco quando è",
  '  pensato per essere eseguito.',
  '- Segnala sempre i comandi distruttivi o irreversibili (rm, dd, mkfs, DROP,',
  '  kubectl delete…) e suggerisci alternative più sicure quando ha senso.',
  '- Usa il contesto della sessione (host, output del terminale, metriche) se',
  '  fornito, ma non inventare dettagli che non possiedi.'
].join('\n')

function buildSystemPrompt(context: AiContext | undefined, extra: string): string {
  const parts = [BASE_SYSTEM]
  if (context) {
    const lines: string[] = []
    if (context.connectionName) lines.push(`Connessione: ${context.connectionName}`)
    if (context.host) lines.push(`Host: ${context.username ? context.username + '@' : ''}${context.host}`)
    if (lines.length) parts.push('## Sessione corrente\n' + lines.join('\n'))
    if (context.metrics) parts.push('## Metriche correnti\n' + context.metrics)
    if (context.terminalTail) {
      parts.push(
        '## Output recente del terminale (il più recente in fondo)\n```\n' +
          context.terminalTail.slice(-6000) +
          '\n```'
      )
    }
  }
  if (extra && extra.trim()) parts.push('## Istruzioni aggiuntive\n' + extra.trim())
  return parts.join('\n\n')
}

export async function sendChat(
  requestId: string,
  messages: AiMessage[],
  context: AiContext | undefined,
  emitDelta: EmitDelta,
  emitDone: EmitDone,
  emitError: EmitError
): Promise<void> {
  const settings = getAiSettings()
  const info = providerInfo(settings.provider)
  if (!info) {
    emitError(requestId, 'Provider AI non configurato.')
    return
  }
  const apiKey = getAiKey(settings.provider) ?? ''
  if (info.needsKey && !apiKey) {
    emitError(requestId, `Nessuna API key salvata per ${info.label}. Aprila nelle impostazioni.`)
    return
  }

  const opts: StreamOptions = {
    apiKey,
    model: settings.model,
    maxTokens: settings.maxTokens,
    temperature: info.supportsTemperature ? settings.temperature : 0,
    baseUrl: settings.baseUrl || undefined,
    system: buildSystemPrompt(context, settings.systemPromptExtra),
    messages
  }

  const controller = new AbortController()
  inflight.set(requestId, controller)
  try {
    for await (const delta of streamChat(settings.provider, opts, controller.signal)) {
      emitDelta(requestId, delta)
    }
    emitDone(requestId)
  } catch (e) {
    if (e instanceof AiAbortError || controller.signal.aborted) {
      emitDone(requestId)
    } else {
      emitError(requestId, e instanceof Error ? e.message : String(e))
    }
  } finally {
    inflight.delete(requestId)
  }
}

export function cancelChat(requestId: string): void {
  const controller = inflight.get(requestId)
  if (controller) controller.abort()
}

export function cancelAllChats(): void {
  for (const c of inflight.values()) c.abort()
  inflight.clear()
}

/** Verifica rapida che provider + chiave funzionino (una richiesta minima). */
export async function testProvider(): Promise<void> {
  const settings = getAiSettings()
  const info = providerInfo(settings.provider)
  if (!info) throw new Error('Provider non configurato.')
  const apiKey = getAiKey(settings.provider) ?? ''
  if (info.needsKey && !apiKey) throw new Error('Nessuna API key salvata.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const opts: StreamOptions = {
      apiKey,
      model: settings.model,
      maxTokens: 8,
      temperature: 0,
      baseUrl: settings.baseUrl || undefined,
      system: 'Rispondi solo con: ok',
      messages: [{ role: 'user', content: 'ping' }]
    }
    let received = false
    for await (const _delta of streamChat(settings.provider, opts, controller.signal)) {
      received = true
      break // basta il primo token per confermare che la pipeline funziona
    }
    if (!received) throw new Error('Nessuna risposta dal modello.')
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

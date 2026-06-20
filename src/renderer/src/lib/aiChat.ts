import { create } from 'zustand'
import type { AiContext, AiMessage } from '@shared/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  error?: string
}

let counter = 0
const uid = (p: string): string => `${p}-${Date.now()}-${counter++}`

interface AiChatState {
  messages: ChatMessage[]
  streaming: boolean
  requestId?: string
  /** Sottoscrive gli eventi di streaming una sola volta. */
  init: () => () => void
  send: (text: string, context?: AiContext) => Promise<void>
  cancel: () => void
  reset: () => void
}

function patchMessage(
  set: (fn: (s: AiChatState) => Partial<AiChatState>) => void,
  id: string,
  patch: (m: ChatMessage) => ChatMessage
): void {
  set((s) => ({ messages: s.messages.map((m) => (m.id === id ? patch(m) : m)) }))
}

export const useAiChat = create<AiChatState>((set, get) => ({
  messages: [],
  streaming: false,
  requestId: undefined,

  init: () => {
    const offDelta = window.phosphor.ai.onDelta((e) => {
      patchMessage(set, e.requestId, (m) => ({ ...m, content: m.content + e.text }))
    })
    const offDone = window.phosphor.ai.onDone((e) => {
      patchMessage(set, e.requestId, (m) => ({ ...m, streaming: false }))
      if (get().requestId === e.requestId) set({ streaming: false, requestId: undefined })
    })
    const offError = window.phosphor.ai.onError((e) => {
      patchMessage(set, e.requestId, (m) => ({
        ...m,
        streaming: false,
        error: e.error
      }))
      if (get().requestId === e.requestId) set({ streaming: false, requestId: undefined })
    })
    return () => {
      offDelta()
      offDone()
      offError()
    }
  },

  send: async (text, context) => {
    if (get().streaming) return
    const requestId = uid('req')
    const userMsg: ChatMessage = { id: uid('u'), role: 'user', content: text }
    const assistantMsg: ChatMessage = {
      id: requestId,
      role: 'assistant',
      content: '',
      streaming: true
    }

    // Cronologia inviata al modello (escludendo messaggi vuoti o in errore).
    const history: AiMessage[] = get()
      .messages.filter((m) => m.content.trim() && !m.error)
      .map((m) => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content: text })

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      streaming: true,
      requestId
    }))

    const res = await window.phosphor.ai.send(requestId, history, context)
    if (!res.ok) {
      patchMessage(set, requestId, (m) => ({ ...m, streaming: false, error: res.error }))
      set({ streaming: false, requestId: undefined })
    }
  },

  cancel: () => {
    const id = get().requestId
    if (id) window.phosphor.ai.cancel(id)
    set({ streaming: false, requestId: undefined })
  },

  reset: () => {
    const id = get().requestId
    if (id) window.phosphor.ai.cancel(id)
    set({ messages: [], streaming: false, requestId: undefined })
  }
}))

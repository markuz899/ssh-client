import { create } from 'zustand'
import type { AiContext, AiMessage } from '@shared/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  error?: string
}

/** Una sessione di chat indipendente, con la sua cronologia. */
export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

let counter = 0
const uid = (p: string): string => `${p}-${Date.now()}-${counter++}`

const STORAGE_KEY = 'phosphor.aiChats'

function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0].trim()
  return line.length > 48 ? line.slice(0, 48) + '…' : line
}

interface Persisted {
  conversations: Conversation[]
  activeId: string | null
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const conversations: Conversation[] = (parsed.conversations ?? []).map(
        (c: Conversation) => ({
          ...c,
          // Nessuno stream è in corso dopo un riavvio; scarta le risposte vuote
          // lasciate da uno stream interrotto.
          messages: (c.messages ?? [])
            .map((m) => ({ ...m, streaming: false }))
            .filter((m) => m.role !== 'assistant' || m.content.trim() || m.error)
        })
      )
      const activeId =
        parsed.activeId && conversations.some((c) => c.id === parsed.activeId)
          ? parsed.activeId
          : conversations[0]?.id ?? null
      return { conversations, activeId }
    }
  } catch {
    /* ignore */
  }
  return { conversations: [], activeId: null }
}

function persist(conversations: Conversation[], activeId: string | null): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeId,
        conversations: conversations.map((c) => ({
          ...c,
          messages: c.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            error: m.error
          }))
        }))
      })
    )
  } catch {
    /* ignore */
  }
}

interface AiChatState {
  conversations: Conversation[]
  activeId: string | null
  /** requestId -> conversationId per gli stream in corso. */
  inflight: Record<string, string>

  init: () => () => void
  newChat: () => string
  selectChat: (id: string) => void
  deleteChat: (id: string) => void
  renameChat: (id: string, title: string) => void
  send: (text: string, context?: AiContext) => Promise<void>
  cancelActive: () => void

  activeConversation: () => Conversation | undefined
  isStreaming: (conversationId?: string | null) => boolean
}

export const useAiChat = create<AiChatState>((set, get) => {
  const initial = load()

  // Applica una patch al messaggio con quell'id, ovunque si trovi.
  const patchMessage = (id: string, patch: (m: ChatMessage) => ChatMessage): void => {
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.messages.some((m) => m.id === id)
          ? { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === id ? patch(m) : m)) }
          : c
      )
    }))
  }

  const dropInflight = (requestId: string): void =>
    set((s) => {
      const inflight = { ...s.inflight }
      delete inflight[requestId]
      return { inflight }
    })

  const save = (): void => persist(get().conversations, get().activeId)

  return {
    conversations: initial.conversations,
    activeId: initial.activeId,
    inflight: {},

    init: () => {
      const offDelta = window.phosphor.ai.onDelta((e) => {
        patchMessage(e.requestId, (m) => ({ ...m, content: m.content + e.text }))
      })
      const offDone = window.phosphor.ai.onDone((e) => {
        patchMessage(e.requestId, (m) => ({ ...m, streaming: false }))
        dropInflight(e.requestId)
        save()
      })
      const offError = window.phosphor.ai.onError((e) => {
        patchMessage(e.requestId, (m) => ({ ...m, streaming: false, error: e.error }))
        dropInflight(e.requestId)
        save()
      })
      return () => {
        offDelta()
        offDone()
        offError()
      }
    },

    newChat: () => {
      const id = uid('chat')
      const now = Date.now()
      const conv: Conversation = { id, title: '', messages: [], createdAt: now, updatedAt: now }
      set((s) => ({ conversations: [conv, ...s.conversations], activeId: id }))
      save()
      return id
    },

    selectChat: (id) => {
      set({ activeId: id })
      save()
    },

    deleteChat: (id) => {
      // Annulla un eventuale stream in corso per questa conversazione.
      const req = Object.entries(get().inflight).find(([, cid]) => cid === id)?.[0]
      if (req) {
        window.phosphor.ai.cancel(req)
        dropInflight(req)
      }
      set((s) => {
        const conversations = s.conversations.filter((c) => c.id !== id)
        const activeId = s.activeId === id ? conversations[0]?.id ?? null : s.activeId
        return { conversations, activeId }
      })
      save()
    },

    renameChat: (id, title) => {
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c))
      }))
      save()
    },

    send: async (text, context) => {
      let convId = get().activeId
      if (!convId || !get().conversations.some((c) => c.id === convId)) {
        convId = get().newChat()
      }
      if (get().isStreaming(convId)) return

      const requestId = uid('req')
      const userMsg: ChatMessage = { id: uid('u'), role: 'user', content: text }
      const assistantMsg: ChatMessage = {
        id: requestId,
        role: 'assistant',
        content: '',
        streaming: true
      }

      const conv = get().conversations.find((c) => c.id === convId)
      const history: AiMessage[] = (conv?.messages ?? [])
        .filter((m) => m.content.trim() && !m.error)
        .map((m) => ({ role: m.role, content: m.content }))
      history.push({ role: 'user', content: text })

      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                title: c.title || titleFrom(text),
                updatedAt: Date.now(),
                messages: [...c.messages, userMsg, assistantMsg]
              }
            : c
        ),
        inflight: { ...s.inflight, [requestId]: convId as string }
      }))
      save()

      const res = await window.phosphor.ai.send(requestId, history, context)
      if (!res.ok) {
        patchMessage(requestId, (m) => ({ ...m, streaming: false, error: res.error }))
        dropInflight(requestId)
        save()
      }
    },

    cancelActive: () => {
      const active = get().activeId
      const req = Object.entries(get().inflight).find(([, cid]) => cid === active)?.[0]
      if (req) {
        window.phosphor.ai.cancel(req)
        patchMessage(req, (m) => ({ ...m, streaming: false }))
        dropInflight(req)
        save()
      }
    },

    activeConversation: () => get().conversations.find((c) => c.id === get().activeId),

    isStreaming: (conversationId) => {
      const cid = conversationId ?? get().activeId
      if (!cid) return false
      return Object.values(get().inflight).includes(cid)
    }
  }
})

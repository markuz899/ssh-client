import { create } from 'zustand'
import type { AiKeyStatus, AiProviderInfo, AiSettings } from '@shared/types'

interface AiState {
  catalog: AiProviderInfo[]
  settings: AiSettings | null
  keyStatus: AiKeyStatus
  loaded: boolean

  load: () => Promise<void>
  updateSettings: (patch: Partial<AiSettings>) => Promise<void>
  setKey: (provider: string, key: string) => Promise<void>
  clearKey: (provider: string) => Promise<void>

  providerInfo: (id?: string) => AiProviderInfo | undefined
  /** True se il provider attivo è pronto all'uso (chiave presente se richiesta). */
  isReady: () => boolean
}

export const useAi = create<AiState>((set, get) => ({
  catalog: [],
  settings: null,
  keyStatus: {},
  loaded: false,

  load: async () => {
    const [cat, st, ks] = await Promise.all([
      window.phosphor.ai.catalog(),
      window.phosphor.ai.getSettings(),
      window.phosphor.ai.keyStatus()
    ])
    set({
      catalog: cat.ok ? cat.data : [],
      settings: st.ok ? st.data : null,
      keyStatus: ks.ok ? ks.data : {},
      loaded: true
    })
  },

  updateSettings: async (patch) => {
    const res = await window.phosphor.ai.setSettings(patch)
    if (res.ok) set({ settings: res.data })
  },

  setKey: async (provider, key) => {
    const res = await window.phosphor.ai.setKey(provider, key)
    if (res.ok) set({ keyStatus: res.data })
  },

  clearKey: async (provider) => {
    const res = await window.phosphor.ai.clearKey(provider)
    if (res.ok) set({ keyStatus: res.data })
  },

  providerInfo: (id) => {
    const pid = id ?? get().settings?.provider
    return get().catalog.find((p) => p.id === pid)
  },

  isReady: () => {
    const { settings, keyStatus } = get()
    if (!settings) return false
    const info = get().providerInfo(settings.provider)
    if (!info) return false
    return !info.needsKey || Boolean(keyStatus[settings.provider])
  }
}))

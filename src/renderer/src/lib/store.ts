import { create } from 'zustand'
import type { Connection, ConnectInput, SavedCommand, SessionStatus } from '@shared/types'

export interface Tab {
  id: string
  sessionId?: string
  connectionId?: string
  title: string
  host: string
  username: string
  status: SessionStatus
  errorMessage?: string
}

export type EditorState =
  | { mode: 'closed' }
  | { mode: 'new' }
  | { mode: 'edit'; connection: Connection }

export type AppView = 'dashboard' | 'terminal' | 'monitor' | 'sftp' | 'tunnels'
export type SidebarSection = 'connections' | 'commands'

/** Viste che usano il pannello laterale per scegliere una connessione. */
export const VIEWS_WITH_SIDEBAR: AppView[] = ['terminal', 'monitor', 'sftp']

interface AppState {
  connections: Connection[]
  tabs: Tab[]
  activeTabId?: string
  editor: EditorState
  encryptionAvailable: boolean
  view: AppView
  /** Connessione attualmente monitorata nella vista Monitor. */
  monitorTargetId?: string
  /** Connessione aperta nella vista SFTP. */
  sftpTargetId?: string
  sidebarCollapsed: boolean
  sidebarSection: SidebarSection
  globalCommands: SavedCommand[]
  /** Barra di ricerca del terminale attivo. */
  searchOpen: boolean

  loadConnections: () => Promise<void>
  loadGlobalCommands: () => Promise<void>
  saveGlobalCommands: (commands: SavedCommand[]) => Promise<void>
  setEncryption: (v: boolean) => void
  openEditor: (s: EditorState) => void
  setView: (v: AppView) => void
  setMonitorTarget: (id?: string) => void
  setSftpTarget: (id?: string) => void
  toggleSidebar: () => void
  setSidebarSection: (s: SidebarSection) => void
  setTabsOrder: (tabs: Tab[]) => void
  setSearchOpen: (v: boolean) => void
  /** Apre un nuovo tab sulla stessa connessione del tab indicato. */
  duplicateTab: (tabId: string) => void
  /** Chiude il tab attivo. */
  closeActiveTab: () => void
  /** Passa al tab successivo (+1) o precedente (-1). */
  cycleTab: (dir: 1 | -1) => void
  /** Invia testo al terminale attivo (se pronto). Ritorna true se inviato. */
  injectToActive: (text: string, run: boolean) => boolean

  addTab: (tab: Tab) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, patch: Partial<Tab>) => void
  removeTab: (id: string) => string | undefined

  /** Apre una sessione SSH per il ConnectInput dato e crea/riempie un tab. */
  startSession: (input: ConnectInput, meta: Omit<Tab, 'id' | 'status'>) => Promise<string>
}

let tabCounter = 0
const nextTabId = (): string => `tab-${Date.now()}-${tabCounter++}`

export const useStore = create<AppState>((set, get) => ({
  connections: [],
  tabs: [],
  activeTabId: undefined,
  editor: { mode: 'closed' },
  encryptionAvailable: true,
  view: 'dashboard',
  monitorTargetId: undefined,
  sftpTargetId: undefined,
  sidebarCollapsed: false,
  sidebarSection: 'connections',
  globalCommands: [],
  searchOpen: false,

  loadConnections: async () => {
    const res = await window.phosphor.connections.list()
    if (res.ok) set({ connections: res.data })
  },

  loadGlobalCommands: async () => {
    const res = await window.phosphor.globalCommands.list()
    if (res.ok) set({ globalCommands: res.data })
  },

  saveGlobalCommands: async (commands) => {
    set({ globalCommands: commands })
    await window.phosphor.globalCommands.set(commands)
  },

  setEncryption: (v) => set({ encryptionAvailable: v }),

  openEditor: (s) => set({ editor: s }),

  setView: (view) => set({ view }),

  setMonitorTarget: (id) => set({ monitorTargetId: id }),

  setSftpTarget: (id) => set({ sftpTargetId: id }),

  toggleSidebar: () => set((st) => ({ sidebarCollapsed: !st.sidebarCollapsed })),

  setSidebarSection: (sidebarSection) => set({ sidebarSection }),

  setTabsOrder: (tabs) => set({ tabs }),

  setSearchOpen: (searchOpen) => set({ searchOpen }),

  duplicateTab: (tabId) => {
    const st = get()
    const tab = st.tabs.find((t) => t.id === tabId)
    if (!tab) return
    const conn = st.connections.find((c) => c.id === tab.connectionId)
    const input: ConnectInput = {
      connectionId: tab.connectionId,
      host: tab.host,
      port: conn?.port ?? 22,
      username: tab.username,
      authMethod: conn?.authMethod ?? 'key',
      keyPath: conn?.keyPath
    }
    st.startSession(input, {
      connectionId: tab.connectionId,
      title: tab.title.replace(/ · \d+$/, '') + ' · ' + (st.tabs.length + 1),
      host: tab.host,
      username: tab.username
    })
  },

  closeActiveTab: () => {
    const { activeTabId, removeTab } = get()
    if (activeTabId) removeTab(activeTabId)
  },

  cycleTab: (dir) => {
    const { tabs, activeTabId, setActiveTab } = get()
    if (tabs.length < 2) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    const next = (idx + dir + tabs.length) % tabs.length
    setActiveTab(tabs[next].id)
  },

  injectToActive: (text, run) => {
    const st = get()
    const tab = st.tabs.find((t) => t.id === st.activeTabId)
    if (!tab?.sessionId || tab.status !== 'ready') return false
    window.phosphor.session.write(tab.sessionId, run ? text + '\r' : text)
    return true
  },

  addTab: (tab) => set((st) => ({ tabs: [...st.tabs, tab], activeTabId: tab.id })),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, patch) =>
    set((st) => ({ tabs: st.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  removeTab: (id) => {
    const st = get()
    const tab = st.tabs.find((t) => t.id === id)
    if (tab?.sessionId) window.phosphor.session.close(tab.sessionId)
    const remaining = st.tabs.filter((t) => t.id !== id)
    let nextActive = st.activeTabId
    if (st.activeTabId === id) {
      const idx = st.tabs.findIndex((t) => t.id === id)
      nextActive = remaining[idx]?.id ?? remaining[idx - 1]?.id ?? remaining[0]?.id
    }
    set({ tabs: remaining, activeTabId: nextActive })
    return nextActive
  },

  startSession: async (input, meta) => {
    const id = nextTabId()
    const tab: Tab = { ...meta, id, status: 'connecting' }
    set((st) => ({ tabs: [...st.tabs, tab], activeTabId: id }))
    const res = await window.phosphor.session.open(input)
    if (!res.ok) {
      set((st) => ({
        tabs: st.tabs.map((t) =>
          t.id === id ? { ...t, status: 'error', errorMessage: res.error } : t
        )
      }))
      return id
    }
    set((st) => ({
      tabs: st.tabs.map((t) => (t.id === id ? { ...t, sessionId: res.data.sessionId } : t))
    }))
    return id
  }
}))

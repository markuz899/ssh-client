import { create } from 'zustand'
import type { Connection, ConnectInput, SavedCommand, SessionStatus } from '@shared/types'
import {
  type LayoutNode,
  type SplitDir,
  leaf,
  collectPaneIds,
  firstLeaf,
  splitLeaf,
  removeLeaf,
  setRatio,
  replaceLeafWithSubtree
} from './layout'

/** Un pannello = un terminale con la propria sessione SSH, stato e cronologia. */
export interface Pane {
  id: string
  sessionId?: string
  connectionId?: string
  title: string
  host: string
  username: string
  status: SessionStatus
  errorMessage?: string
}

/** Una scheda contiene un layout (albero) di pannelli. */
export interface Tab {
  id: string
  title: string
  layout: LayoutNode
  activePaneId: string
}

export interface PaneMeta {
  connectionId?: string
  title: string
  host: string
  username: string
}

export type EditorState =
  | { mode: 'closed' }
  | { mode: 'new' }
  | { mode: 'edit'; connection: Connection }

export type AppView =
  | 'dashboard'
  | 'terminal'
  | 'monitor'
  | 'sftp'
  | 'tunnels'
  | 'logs'
  | 'docker'
export type SidebarSection = 'connections' | 'commands'

export const VIEWS_WITH_SIDEBAR: AppView[] = ['terminal', 'monitor', 'sftp', 'logs', 'docker']

// ---- Layout salvabili ----
type SnapNode =
  | { type: 'leaf'; connectionId?: string; title: string; host: string; username: string }
  | { type: 'split'; dir: SplitDir; a: SnapNode; b: SnapNode; ratio: number }
export interface SavedLayout {
  name: string
  tabs: { title: string; tree: SnapNode }[]
}

const LAYOUTS_KEY = 'phosphor.layouts'
function loadLayouts(): SavedLayout[] {
  try {
    return JSON.parse(localStorage.getItem(LAYOUTS_KEY) ?? '[]')
  } catch {
    return []
  }
}
function persistLayouts(list: SavedLayout[]): void {
  localStorage.setItem(LAYOUTS_KEY, JSON.stringify(list))
}

interface AppState {
  connections: Connection[]
  panes: Record<string, Pane>
  tabs: Tab[]
  activeTabId?: string
  editor: EditorState
  encryptionAvailable: boolean
  view: AppView
  monitorTargetId?: string
  sftpTargetId?: string
  logsTargetId?: string
  dockerTargetId?: string
  sidebarCollapsed: boolean
  sidebarSection: SidebarSection
  globalCommands: SavedCommand[]
  searchOpen: boolean
  savedLayouts: SavedLayout[]
  /** Tab attualmente trascinato (per drop-to-split). */
  draggingTabId?: string

  loadConnections: () => Promise<void>
  loadGlobalCommands: () => Promise<void>
  saveGlobalCommands: (commands: SavedCommand[]) => Promise<void>
  setEncryption: (v: boolean) => void
  openEditor: (s: EditorState) => void
  setView: (v: AppView) => void
  setMonitorTarget: (id?: string) => void
  setSftpTarget: (id?: string) => void
  setLogsTarget: (id?: string) => void
  setDockerTarget: (id?: string) => void
  toggleSidebar: () => void
  setSidebarSection: (s: SidebarSection) => void
  setTabsOrder: (tabs: Tab[]) => void
  setSearchOpen: (v: boolean) => void

  setActiveTab: (id: string) => void
  setActivePane: (tabId: string, paneId: string) => void
  updatePane: (paneId: string, patch: Partial<Pane>) => void
  removeTab: (id: string) => void
  closePane: (tabId: string, paneId: string) => void
  splitPane: (tabId: string, paneId: string, dir: SplitDir) => void
  setSplitRatio: (tabId: string, splitId: string, ratio: number) => void
  reconnectPane: (paneId: string) => void
  setDraggingTab: (id?: string) => void
  /** Sposta un intero tab dentro un pannello di un altro tab, creando uno split. */
  moveTabIntoPane: (
    sourceTabId: string,
    targetTabId: string,
    targetPaneId: string,
    dir: SplitDir,
    before: boolean
  ) => void

  duplicateTab: (tabId: string) => void
  closeActiveTab: () => void
  cycleTab: (dir: 1 | -1) => void
  injectToActive: (text: string, run: boolean) => boolean

  /** Apre una sessione SSH e crea una nuova scheda con un singolo pannello. */
  startSession: (input: ConnectInput, meta: PaneMeta) => Promise<string>

  saveCurrentLayout: (name: string) => void
  restoreLayout: (name: string) => void
  deleteLayout: (name: string) => void
}

let counter = 0
const uid = (p: string): string => `${p}-${Date.now()}-${counter++}`

function inputFromConnection(c: Connection): ConnectInput {
  return {
    connectionId: c.id,
    host: c.host,
    port: c.port,
    username: c.username,
    authMethod: c.authMethod,
    keyPath: c.keyPath
  }
}

function snapshotNode(node: LayoutNode, panes: Record<string, Pane>): SnapNode {
  if (node.type === 'leaf') {
    const p = panes[node.paneId]
    return {
      type: 'leaf',
      connectionId: p?.connectionId,
      title: p?.title ?? '',
      host: p?.host ?? '',
      username: p?.username ?? ''
    }
  }
  return {
    type: 'split',
    dir: node.dir,
    a: snapshotNode(node.a, panes),
    b: snapshotNode(node.b, panes),
    ratio: node.ratio
  }
}

export const useStore = create<AppState>((set, get) => {
  // Avvia la sessione per un pannello già presente nello store.
  const openSession = async (paneId: string, input: ConnectInput): Promise<void> => {
    const res = await window.phosphor.session.open(input)
    if (!res.ok) {
      get().updatePane(paneId, { status: 'error', errorMessage: res.error })
      return
    }
    get().updatePane(paneId, { sessionId: res.data.sessionId })
  }

  return {
    connections: [],
    panes: {},
    tabs: [],
    activeTabId: undefined,
    editor: { mode: 'closed' },
    encryptionAvailable: true,
    view: 'dashboard',
    monitorTargetId: undefined,
    sftpTargetId: undefined,
    logsTargetId: undefined,
    dockerTargetId: undefined,
    sidebarCollapsed: false,
    sidebarSection: 'connections',
    globalCommands: [],
    searchOpen: false,
    savedLayouts: loadLayouts(),
    draggingTabId: undefined,

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
    setLogsTarget: (id) => set({ logsTargetId: id }),
    setDockerTarget: (id) => set({ dockerTargetId: id }),
    toggleSidebar: () => set((st) => ({ sidebarCollapsed: !st.sidebarCollapsed })),
    setSidebarSection: (sidebarSection) => set({ sidebarSection }),
    setTabsOrder: (tabs) => set({ tabs }),
    setSearchOpen: (searchOpen) => set({ searchOpen }),

    setActiveTab: (id) => set({ activeTabId: id }),

    setActivePane: (tabId, paneId) =>
      set((st) => ({
        tabs: st.tabs.map((t) => (t.id === tabId ? { ...t, activePaneId: paneId } : t))
      })),

    updatePane: (paneId, patch) =>
      set((st) => {
        const pane = st.panes[paneId]
        if (!pane) return {}
        return { panes: { ...st.panes, [paneId]: { ...pane, ...patch } } }
      }),

    removeTab: (id) => {
      const st = get()
      const tab = st.tabs.find((t) => t.id === id)
      if (!tab) return
      const paneIds = collectPaneIds(tab.layout)
      const panes = { ...st.panes }
      paneIds.forEach((pid) => {
        const sid = panes[pid]?.sessionId
        if (sid) window.phosphor.session.close(sid)
        delete panes[pid]
      })
      const remaining = st.tabs.filter((t) => t.id !== id)
      let nextActive = st.activeTabId
      if (st.activeTabId === id) {
        const idx = st.tabs.findIndex((t) => t.id === id)
        nextActive = remaining[idx]?.id ?? remaining[idx - 1]?.id ?? remaining[0]?.id
      }
      set({ tabs: remaining, panes, activeTabId: nextActive })
    },

    closePane: (tabId, paneId) => {
      const st = get()
      const tab = st.tabs.find((t) => t.id === tabId)
      if (!tab) return
      const nextLayout = removeLeaf(tab.layout, paneId)
      // Chiudi la sessione del pannello rimosso.
      const sid = st.panes[paneId]?.sessionId
      if (sid) window.phosphor.session.close(sid)
      if (nextLayout === null) {
        get().removeTab(tabId)
        return
      }
      const panes = { ...st.panes }
      delete panes[paneId]
      const activePaneId =
        tab.activePaneId === paneId ? firstLeaf(nextLayout) : tab.activePaneId
      set({
        panes,
        tabs: st.tabs.map((t) => (t.id === tabId ? { ...t, layout: nextLayout, activePaneId } : t))
      })
    },

    splitPane: (tabId, paneId, dir) => {
      const st = get()
      const tab = st.tabs.find((t) => t.id === tabId)
      const source = st.panes[paneId]
      if (!tab || !source) return
      const conn = st.connections.find((c) => c.id === source.connectionId)
      const newPaneId = uid('pane')
      const newPane: Pane = {
        id: newPaneId,
        connectionId: source.connectionId,
        title: source.title,
        host: source.host,
        username: source.username,
        status: 'connecting'
      }
      const nextLayout = splitLeaf(tab.layout, paneId, dir, newPaneId, uid('split'))
      set({
        panes: { ...st.panes, [newPaneId]: newPane },
        tabs: st.tabs.map((t) =>
          t.id === tabId ? { ...t, layout: nextLayout, activePaneId: newPaneId } : t
        )
      })
      if (conn) openSession(newPaneId, inputFromConnection(conn))
      else
        get().updatePane(newPaneId, {
          status: 'error',
          errorMessage: 'Connessione non disponibile per il nuovo pannello.'
        })
    },

    setSplitRatio: (tabId, splitId, ratio) =>
      set((st) => ({
        tabs: st.tabs.map((t) =>
          t.id === tabId ? { ...t, layout: setRatio(t.layout, splitId, ratio) } : t
        )
      })),

    reconnectPane: (paneId) => {
      const st = get()
      const pane = st.panes[paneId]
      if (!pane) return
      const conn = st.connections.find((c) => c.id === pane.connectionId)
      if (!conn) {
        get().updatePane(paneId, { status: 'error', errorMessage: 'Connessione non disponibile.' })
        return
      }
      get().updatePane(paneId, { status: 'connecting', errorMessage: undefined, sessionId: undefined })
      openSession(paneId, inputFromConnection(conn))
    },

    setDraggingTab: (draggingTabId) => set({ draggingTabId }),

    moveTabIntoPane: (sourceTabId, targetTabId, targetPaneId, dir, before) => {
      const st = get()
      if (sourceTabId === targetTabId) return
      const source = st.tabs.find((t) => t.id === sourceTabId)
      const target = st.tabs.find((t) => t.id === targetTabId)
      if (!source || !target) return
      // Innesta l'intero layout del tab sorgente sulla foglia di destinazione.
      const newLayout = replaceLeafWithSubtree(
        target.layout,
        targetPaneId,
        dir,
        source.layout,
        before,
        uid('split')
      )
      const movedPane = source.activePaneId
      const tabs = st.tabs
        .filter((t) => t.id !== sourceTabId)
        .map((t) => (t.id === targetTabId ? { ...t, layout: newLayout, activePaneId: movedPane } : t))
      set({ tabs, activeTabId: targetTabId, draggingTabId: undefined })
    },

    duplicateTab: (tabId) => {
      const st = get()
      const tab = st.tabs.find((t) => t.id === tabId)
      if (!tab) return
      const source = st.panes[tab.activePaneId]
      if (!source) return
      const conn = st.connections.find((c) => c.id === source.connectionId)
      const input: ConnectInput = {
        connectionId: source.connectionId,
        host: source.host,
        port: conn?.port ?? 22,
        username: source.username,
        authMethod: conn?.authMethod ?? 'key',
        keyPath: conn?.keyPath
      }
      st.startSession(input, {
        connectionId: source.connectionId,
        title: source.title,
        host: source.host,
        username: source.username
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
      const pane = tab && st.panes[tab.activePaneId]
      if (!pane?.sessionId || pane.status !== 'ready') return false
      window.phosphor.session.write(pane.sessionId, run ? text + '\r' : text)
      return true
    },

    startSession: async (input, meta) => {
      const paneId = uid('pane')
      const tabId = uid('tab')
      const pane: Pane = { ...meta, id: paneId, status: 'connecting' }
      const tab: Tab = {
        id: tabId,
        title: meta.title,
        layout: leaf(paneId),
        activePaneId: paneId
      }
      set((st) => ({
        panes: { ...st.panes, [paneId]: pane },
        tabs: [...st.tabs, tab],
        activeTabId: tabId
      }))
      await openSession(paneId, input)
      return tabId
    },

    saveCurrentLayout: (name) => {
      const st = get()
      if (st.tabs.length === 0) return
      const snapshot: SavedLayout = {
        name,
        tabs: st.tabs.map((t) => ({ title: t.title, tree: snapshotNode(t.layout, st.panes) }))
      }
      const list = [...st.savedLayouts.filter((l) => l.name !== name), snapshot]
      persistLayouts(list)
      set({ savedLayouts: list })
    },

    restoreLayout: (name) => {
      const st = get()
      const saved = st.savedLayouts.find((l) => l.name === name)
      if (!saved) return
      saved.tabs.forEach((snapTab) => {
        const newPanes: Record<string, Pane> = {}
        const toConnect: { paneId: string; input: ConnectInput }[] = []
        const build = (snap: SnapNode): LayoutNode => {
          if (snap.type === 'leaf') {
            const paneId = uid('pane')
            const conn = get().connections.find((c) => c.id === snap.connectionId)
            newPanes[paneId] = {
              id: paneId,
              connectionId: snap.connectionId,
              title: snap.title,
              host: snap.host,
              username: snap.username,
              status: conn ? 'connecting' : 'error',
              errorMessage: conn ? undefined : 'Connessione non più disponibile.'
            }
            if (conn) toConnect.push({ paneId, input: inputFromConnection(conn) })
            return leaf(paneId)
          }
          return {
            type: 'split',
            id: uid('split'),
            dir: snap.dir,
            a: build(snap.a),
            b: build(snap.b),
            ratio: snap.ratio
          }
        }
        const layout = build(snapTab.tree)
        const tabId = uid('tab')
        set((s) => ({
          panes: { ...s.panes, ...newPanes },
          tabs: [...s.tabs, { id: tabId, title: snapTab.title, layout, activePaneId: firstLeaf(layout) }],
          activeTabId: tabId
        }))
        toConnect.forEach(({ paneId, input }) => openSession(paneId, input))
      })
      set({ view: 'terminal' })
    },

    deleteLayout: (name) => {
      const st = get()
      const list = st.savedLayouts.filter((l) => l.name !== name)
      persistLayouts(list)
      set({ savedLayouts: list })
    }
  }
})

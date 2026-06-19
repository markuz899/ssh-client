import type { SearchAddon } from '@xterm/addon-search'
import type { Terminal } from '@xterm/xterm'

// Registro dei terminali montati, indicizzati per tabId. Serve a far operare
// la barra di ricerca (montata una sola volta nel Workspace) sul terminale
// del tab attivo.

interface Entry {
  terminal: Terminal
  search: SearchAddon
}

const registry = new Map<string, Entry>()

export function registerTerminal(tabId: string, entry: Entry): () => void {
  registry.set(tabId, entry)
  return () => {
    if (registry.get(tabId) === entry) registry.delete(tabId)
  }
}

export function getTerminal(tabId?: string): Entry | undefined {
  return tabId ? registry.get(tabId) : undefined
}

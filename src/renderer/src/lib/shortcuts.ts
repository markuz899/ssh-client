// Sistema di scorciatoie da tastiera configurabili.
//
// Una scorciatoia è una stringa "combo" canonica, es. "cmd+f", "ctrl+shift+tab".
// I modificatori sono sempre in ordine: cmd, ctrl, alt, shift, poi il tasto.

export type ActionId =
  | 'searchTerminal'
  | 'toggleSidebar'
  | 'openSettings'
  | 'newConnection'
  | 'closeTab'
  | 'duplicateTab'
  | 'nextTab'
  | 'prevTab'
  | 'viewTerminal'
  | 'viewMonitor'

export interface ActionMeta {
  id: ActionId
  label: string
  group: 'Terminale' | 'Finestra' | 'Navigazione'
}

export const ACTIONS: ActionMeta[] = [
  { id: 'searchTerminal', label: 'Cerca nel terminale', group: 'Terminale' },
  { id: 'duplicateTab', label: 'Duplica tab', group: 'Terminale' },
  { id: 'closeTab', label: 'Chiudi tab', group: 'Terminale' },
  { id: 'nextTab', label: 'Tab successivo', group: 'Terminale' },
  { id: 'prevTab', label: 'Tab precedente', group: 'Terminale' },
  { id: 'newConnection', label: 'Nuova connessione', group: 'Finestra' },
  { id: 'toggleSidebar', label: 'Comprimi/espandi pannello', group: 'Finestra' },
  { id: 'openSettings', label: 'Apri impostazioni', group: 'Finestra' },
  { id: 'viewTerminal', label: 'Vai a Terminali', group: 'Navigazione' },
  { id: 'viewMonitor', label: 'Vai a Monitor', group: 'Navigazione' }
]

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

const MOD = IS_MAC ? 'cmd' : 'ctrl'

export const DEFAULT_BINDINGS: Record<ActionId, string> = {
  searchTerminal: `${MOD}+f`,
  duplicateTab: `${MOD}+d`,
  closeTab: `${MOD}+w`,
  nextTab: 'ctrl+tab',
  prevTab: 'ctrl+shift+tab',
  newConnection: `${MOD}+n`,
  toggleSidebar: `${MOD}+b`,
  openSettings: `${MOD}+,`,
  viewTerminal: `${MOD}+1`,
  viewMonitor: `${MOD}+2`
}

const KEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Escape: 'esc',
  Tab: 'tab',
  Enter: 'enter'
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

/** Converte un evento tastiera nel combo canonico, o null se è solo un modificatore. */
export function eventToCombo(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.metaKey) parts.push('cmd')
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  const key = KEY_ALIASES[e.key] ?? e.key.toLowerCase()
  parts.push(key)
  return parts.join('+')
}

/** Etichetta leggibile del combo per la UI (con simboli su macOS). */
export function formatCombo(combo: string): string {
  if (!combo) return '—'
  const sym: Record<string, string> = IS_MAC
    ? { cmd: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' }
    : { cmd: 'Win', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' }
  return combo
    .split('+')
    .map((p) => sym[p] ?? (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(IS_MAC ? ' ' : '+')
}

// --- Emitter delle azioni ---
type Handler = (id: ActionId) => void
const handlers = new Set<Handler>()

export function onAction(handler: Handler): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

export function emitAction(id: ActionId): void {
  handlers.forEach((h) => h(id))
}

/**
 * Confronta l'evento con i binding: se combacia emette l'azione e ritorna true.
 * Usato sia dal listener globale sia dall'handler custom di xterm.
 */
export function matchAndDispatch(e: KeyboardEvent, bindings: Record<ActionId, string>): boolean {
  const combo = eventToCombo(e)
  if (!combo) return false
  for (const action of ACTIONS) {
    if (bindings[action.id] === combo) {
      emitAction(action.id)
      return true
    }
  }
  return false
}

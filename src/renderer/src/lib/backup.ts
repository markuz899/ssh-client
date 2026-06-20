// Chiavi del renderer (localStorage) incluse nel backup: aspetto/scorciatoie,
// layout salvati e cronologia delle chat AI.
const LOCAL_KEYS = ['phosphor.settings', 'phosphor.layouts', 'phosphor.aiChats']

export function gatherLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of LOCAL_KEYS) {
    const v = localStorage.getItem(k)
    if (v != null) out[k] = v
  }
  return out
}

export function applyLocal(local: Record<string, string>): void {
  for (const k of LOCAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(local, k)) localStorage.setItem(k, local[k])
  }
}

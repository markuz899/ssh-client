// Formattazioni per la dashboard di monitoraggio.

export function formatBytesFromKb(kb: number): string {
  let v = kb * 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}g ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** Colore di stato in base a una percentuale (verde → ambra → rosso). */
export function loadColor(percent: number): string {
  if (percent >= 90) return '#FF5C6A'
  if (percent >= 70) return '#FFB347'
  return '#5BF08A'
}

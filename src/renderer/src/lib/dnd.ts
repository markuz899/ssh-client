// Tipo MIME custom usato nel drag&drop dei tab (riordino + drop-to-split).
export const TAB_DND_TYPE = 'application/x-phosphor-tab'

export type DropZone = 'left' | 'right' | 'top' | 'bottom'

/** Calcola la zona di bordo più vicina al cursore dentro un rettangolo. */
export function edgeZone(rect: DOMRect, clientX: number, clientY: number): DropZone {
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  const dist = { left: x, right: 1 - x, top: y, bottom: 1 - y }
  return (Object.keys(dist) as DropZone[]).reduce((a, b) => (dist[b] < dist[a] ? b : a), 'left')
}

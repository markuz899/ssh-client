// Albero binario di layout per la Split View.
// Un nodo è una foglia (un pannello/terminale) o una divisione con due figli
// (a/b) e un rapporto di dimensione per il figlio "a".

export type SplitDir = 'row' | 'col' // row = affiancati, col = impilati

export type LayoutNode =
  | { type: 'leaf'; paneId: string }
  | { type: 'split'; id: string; dir: SplitDir; a: LayoutNode; b: LayoutNode; ratio: number }

export const leaf = (paneId: string): LayoutNode => ({ type: 'leaf', paneId })

export function collectPaneIds(node: LayoutNode): string[] {
  return node.type === 'leaf' ? [node.paneId] : [...collectPaneIds(node.a), ...collectPaneIds(node.b)]
}

export function firstLeaf(node: LayoutNode): string {
  return node.type === 'leaf' ? node.paneId : firstLeaf(node.a)
}

/** Sostituisce la foglia indicata con una divisione [foglia, nuovaFoglia]. */
export function splitLeaf(
  node: LayoutNode,
  targetPaneId: string,
  dir: SplitDir,
  newPaneId: string,
  splitId: string
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.paneId !== targetPaneId) return node
    return { type: 'split', id: splitId, dir, a: node, b: leaf(newPaneId), ratio: 0.5 }
  }
  return {
    ...node,
    a: splitLeaf(node.a, targetPaneId, dir, newPaneId, splitId),
    b: splitLeaf(node.b, targetPaneId, dir, newPaneId, splitId)
  }
}

/** Rimuove una foglia; la divisione genitore collassa sul figlio rimasto.
 *  Ritorna null se l'albero resta vuoto. */
export function removeLeaf(node: LayoutNode, targetPaneId: string): LayoutNode | null {
  if (node.type === 'leaf') return node.paneId === targetPaneId ? null : node
  const a = removeLeaf(node.a, targetPaneId)
  const b = removeLeaf(node.b, targetPaneId)
  if (a === null) return b
  if (b === null) return a
  return { ...node, a, b }
}

/** Aggiorna il rapporto di una specifica divisione. */
export function setRatio(node: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (node.type === 'leaf') return node
  if (node.id === splitId) return { ...node, ratio }
  return {
    ...node,
    a: setRatio(node.a, splitId, ratio),
    b: setRatio(node.b, splitId, ratio)
  }
}

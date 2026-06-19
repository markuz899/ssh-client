import { useRef } from 'react'
import { useStore, type Tab } from '../../lib/store'
import type { LayoutNode } from '../../lib/layout'
import PaneView from './PaneView'

interface Props {
  node: LayoutNode
  tab: Tab
  multi: boolean
}

/** Renderizza ricorsivamente l'albero di layout in pannelli e divisioni. */
export default function LayoutView({ node, tab, multi }: Props): JSX.Element | null {
  const pane = useStore((s) => (node.type === 'leaf' ? s.panes[node.paneId] : undefined))

  if (node.type === 'leaf') {
    if (!pane) return null
    return (
      <PaneView
        tabId={tab.id}
        pane={pane}
        isActivePane={tab.activePaneId === pane.id}
        multi={multi}
      />
    )
  }
  return <SplitContainer node={node} tab={tab} multi={multi} />
}

function SplitContainer({
  node,
  tab,
  multi
}: {
  node: Extract<LayoutNode, { type: 'split' }>
  tab: Tab
  multi: boolean
}): JSX.Element {
  const setSplitRatio = useStore((s) => s.setSplitRatio)
  const ref = useRef<HTMLDivElement>(null)
  const row = node.dir === 'row'

  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const move = (ev: PointerEvent): void => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const ratio = row ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height
      setSplitRatio(tab.id, node.id, Math.max(0.12, Math.min(0.88, ratio)))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = row ? 'col-resize' : 'row-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={ref} className={`flex h-full w-full ${row ? 'flex-row' : 'flex-col'}`}>
      <div className="relative min-h-0 min-w-0" style={{ flexGrow: node.ratio, flexBasis: 0 }}>
        <LayoutView node={node.a} tab={tab} multi={multi} />
      </div>
      <div
        onPointerDown={startResize}
        className={`group relative z-30 shrink-0 bg-line transition-colors hover:bg-phosphor/50 ${
          row ? 'w-[3px] cursor-col-resize' : 'h-[3px] cursor-row-resize'
        }`}
      >
        {/* Area di presa più ampia del divisore visibile. */}
        <div
          className={`absolute ${row ? '-inset-x-1.5 inset-y-0' : '-inset-y-1.5 inset-x-0'}`}
        />
      </div>
      <div className="relative min-h-0 min-w-0" style={{ flexGrow: 1 - node.ratio, flexBasis: 0 }}>
        <LayoutView node={node.b} tab={tab} multi={multi} />
      </div>
    </div>
  )
}

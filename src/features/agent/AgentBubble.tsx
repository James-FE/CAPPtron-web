import { useEffect, useRef, useState } from 'react'

type Position = { x: number; y: number }
const storageKey = 'capptron.agent.position.v1'

function clamp(position: Position): Position {
  return {
    x: Math.max(8, Math.min(position.x, window.innerWidth - 116)),
    y: Math.max(8, Math.min(position.y, window.innerHeight - 48)),
  }
}

function defaultPosition(): Position {
  const gutter = window.innerWidth > 1600 ? Math.max(48, (window.innerWidth - 1840) / 2 + 48) : 32
  return clamp({ x: window.innerWidth - gutter - 132, y: window.innerHeight - 100 })
}

function initialPosition(): Position {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (
      value &&
      typeof value === 'object' &&
      'x' in value &&
      'y' in value &&
      typeof value.x === 'number' &&
      typeof value.y === 'number' &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y)
    ) {
      return clamp({ x: value.x, y: value.y })
    }
  } catch {
    /* 浏览器禁用存储或数据损坏时仍保持入口可用。 */
  }
  return defaultPosition()
}

export function AgentBubble({ onOpen }: { onOpen: () => void }) {
  const [position, setPosition] = useState(initialPosition)
  const drag = useRef<{
    pointerId: number
    start: Position
    origin: Position
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => {
    function resize() {
      setPosition((current) => clamp(current))
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(position))
    } catch {
      /* 存储不可用不影响本次拖动。 */
    }
  }, [position])
  return (
    <button
      type="button"
      className="button agent-bubble"
      style={{ left: position.x, top: position.y }}
      aria-label="打开 Agent 协同"
      aria-haspopup="dialog"
      title="点击打开；拖动移动；方向键微调，Home 恢复默认位置"
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return
        suppressClick.current = false
        drag.current = {
          pointerId: event.pointerId,
          start: { x: event.clientX, y: event.clientY },
          origin: position,
          moved: false,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || event.pointerId !== current.pointerId) return
        const dx = event.clientX - current.start.x,
          dy = event.clientY - current.start.y
        if (Math.hypot(dx, dy) > 5) current.moved = true
        if (current.moved)
          setPosition(clamp({ x: current.origin.x + dx, y: current.origin.y + dy }))
      }}
      onPointerUp={(event) => {
        if (!drag.current || event.pointerId !== drag.current.pointerId) return
        suppressClick.current = drag.current.moved
        drag.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        drag.current = null
        suppressClick.current = true
      }}
      onLostPointerCapture={() => {
        drag.current = null
      }}
      onClick={(event) => {
        if (suppressClick.current && event.detail !== 0) {
          suppressClick.current = false
          return
        }
        onOpen()
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16
        const offsets: Record<string, Position> = {
          ArrowLeft: { x: -step, y: 0 },
          ArrowRight: { x: step, y: 0 },
          ArrowUp: { x: 0, y: -step },
          ArrowDown: { x: 0, y: step },
        }
        const offset = offsets[event.key]
        if (offset || event.key === 'Home') {
          event.preventDefault()
          setPosition((current) =>
            offset
              ? clamp({ x: current.x + offset.x, y: current.y + offset.y })
              : defaultPosition(),
          )
        }
      }}
    >
      <span aria-hidden="true">✦</span> Agent
    </button>
  )
}

import { useEffect, useLayoutEffect, useRef } from 'react'
import type { AgentMessage } from './agentSession'
import type { ProcessPlan } from '../process-planning/processPlan'

export function AgentDrawer({
  open,
  onClose,
  plan,
  operationId,
  onOperation,
  messages,
  input,
  onInput,
  onSend,
}: {
  open: boolean
  onClose: () => void
  plan: ProcessPlan | null
  operationId: string | null
  onOperation: (id: string) => void
  messages: AgentMessage[]
  input: string
  onInput: (value: string) => void
  onSend: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const positions = useRef<Record<string, number>>({})
  const previousCount = useRef(0)
  const taskKey = plan?.id ?? 'unassigned'
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])
  useLayoutEffect(() => {
    if (!open || !log.current) return
    log.current.scrollTop = positions.current[taskKey] ?? 0
  }, [open, taskKey])
  useLayoutEffect(() => {
    if (open && log.current && messages.length > previousCount.current)
      log.current.scrollTop = log.current.scrollHeight
    previousCount.current = messages.length
  }, [messages.length, open])
  return (
    <dialog
      ref={dialog}
      className="agent-drawer"
      aria-labelledby="agent-title"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        )
        const first = controls[0],
          last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right) onClose()
      }}
    >
      <div className="agent-drawer-layout">
        <header className="agent-heading">
          <h2 id="agent-title">Agent 协同</h2>
          <button className="button" type="button" onClick={onClose} aria-label="关闭 Agent 抽屉">
            收起
          </button>
        </header>
        <section className="agent-context" aria-label="Agent 当前上下文">
          <p>{plan ? `${plan.partName} · ${plan.name} · Demo` : '未加载工艺方案'}</p>
          <div className="agent-operation-picker">
            <label htmlFor="agent-operation">当前工序</label>
            <select
              id="agent-operation"
              value={operationId ?? ''}
              onChange={(event) => onOperation(event.target.value)}
              disabled={!plan?.operations.length}
            >
              {plan?.taskMeasurements?.length ? (
                <option value="">任务级 · 共用信息</option>
              ) : (
                !plan?.operations.length && <option value="">暂无工序</option>
              )}
              {plan?.operations.map((operation) => (
                <option key={operation.id} value={operation.id}>
                  {operation.sequence} {operation.name}
                </option>
              ))}
            </select>
          </div>
          <p className="muted-text">仅同步 UI 上下文，未交给真实 Agent 读取。</p>
        </section>
        <div
          className="agent-log"
          ref={log}
          role="log"
          aria-label="Agent 对话记录"
          aria-live="polite"
          tabIndex={0}
          onScroll={(event) => {
            positions.current[taskKey] = event.currentTarget.scrollTop
          }}
        >
          <p className="warning-text">预设对话演示 · 非真实 Agent</p>
          <p>可记录工艺、刀具或参数方面的问题。尚未连接真实 Agent，发送后仅展示固定说明。</p>
          {messages.map((message) => (
            <article key={message.id} className={`agent-message message-${message.role}`}>
              <p className="muted-text">
                {message.role === 'user' ? '你' : 'Agent · Demo 固定回复'} · {message.contextLabel}
              </p>
              <p>{message.text}</p>
            </article>
          ))}
        </div>
        <form
          className="agent-composer"
          onSubmit={(event) => {
            event.preventDefault()
            onSend()
          }}
        >
          <p className="muted-text">演示记录不会修改工艺、调用 CAM 或保存至服务器。</p>
          <label htmlFor="agent-message">消息</label>
          <textarea
            id="agent-message"
            value={input}
            onChange={(event) => onInput(event.target.value)}
            disabled={!plan}
            maxLength={2000}
            placeholder={plan ? '输入消息，体验 Demo 对话' : '请先显式加载演示方案'}
            rows={3}
          />
          <div className="agent-send">
            <span className="muted-text">{input.length} / 2000 · 仅本次页面会话</span>
            <button
              className="button primary-button"
              type="submit"
              disabled={!plan || !input.trim()}
            >
              发送演示消息
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

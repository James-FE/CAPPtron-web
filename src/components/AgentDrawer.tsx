import { useState, type FormEvent } from 'react'

type Props = {
  open: boolean
  context: string
  onClose: () => void
}

export function AgentDrawer({ open, context, onClose }: Props) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<string[]>([])

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = draft.trim()
    if (!next) return
    setMessages((items) => [...items, next])
    setDraft('')
  }

  if (!open) return null
  return (
    <aside className="agent-drawer" aria-label="Agent 演示对话">
      <div className="drawer-header">
        <div>
          <strong>✦ Agent 协同</strong>
          <p>模拟对话 · 无真实模型调用</p>
        </div>
        <button type="button" onClick={onClose} className="icon-button" aria-label="关闭 Agent">
          ×
        </button>
      </div>
      <div className="drawer-history custom-scroll" aria-live="polite">
        <p className="agent-message">
          演示上下文：{context}。这里只记录本地消息，不会修改工艺或调用 CAM。
        </p>
        {messages.map((message, index) => (
          <div className="agent-exchange" key={`${index}-${message}`}>
            <p className="user-message">{message}</p>
            <p className="agent-message">
              演示回复：已收到意见，但目前尚未连接 Agent 服务。该内容未提交到后端。
            </p>
          </div>
        ))}
      </div>
      <form className="drawer-composer" onSubmit={send}>
        <label className="visually-hidden" htmlFor="agent-draft">
          输入演示意见
        </label>
        <input
          id="agent-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="补充现场情况或提出问题…"
        />
        <button type="submit" className="button primary" disabled={!draft.trim()}>
          发送
        </button>
      </form>
    </aside>
  )
}

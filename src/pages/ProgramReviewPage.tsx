import { useState } from 'react'
import type { DemoTask, ProcessOperation } from '../api/view-model'
import { createDemoNcPreview } from '../mocks/tasks'

type Props = {
  task: DemoTask
  operation: ProcessOperation | null
  acknowledged: boolean
  onAcknowledge: () => void
  onReturn: () => void
}

export function ProgramReviewPage({
  task,
  operation,
  acknowledged,
  onAcknowledge,
  onReturn,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const preview = createDemoNcPreview(task, operation)

  return (
    <section className="page-body review-page" aria-labelledby="review-heading">
      <div className="review-title-bar">
        <h2 id="review-heading">程序审核</h2>
        <span className="warning-text">
          {task.ncPreviewName} · {acknowledged ? '演示确认已记录' : '演示待确认'}
        </span>
        <button type="button" className="button secondary" onClick={onReturn}>
          返回工艺决策
        </button>
      </div>
      <div className={expanded ? 'code-panel expanded' : 'code-panel'}>
        <div className="code-heading">
          <div>
            <h3>{task.ncPreviewName}</h3>
            <p>仅展示示意文本，不是后端产物</p>
          </div>
          <button
            type="button"
            className="button secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '收起代码' : '展开代码'}
          </button>
        </div>
        <pre className="code-content custom-scroll" role="region" aria-label="NC 程序示例内容">
          <code>
            {preview
              .map((line, index) => `${String(index + 1).padStart(2, '0')}   ${line}`)
              .join('\n')}
          </code>
        </pre>
        <div className="review-bottom">
          <p className="warning-text">
            非真实加工程序 · 不可执行 · 未进行刀路仿真、后处理或安全验证
          </p>
          <div className="bottom-actions">
            <button
              type="button"
              className="button secondary"
              disabled
              title="不存在真实可下载的 NC 文件"
            >
              程序下载
            </button>
            <button type="button" className="button primary" onClick={onAcknowledge}>
              {acknowledged ? '演示确认已记录' : '确认可用 · 仅演示'}
            </button>
          </div>
        </div>
        {acknowledged && (
          <p role="status" className="review-confirmation">
            仅更新了浏览器中的演示确认状态；不是工艺卡批准、NC 验证通过或实机许可。
          </p>
        )}
      </div>
    </section>
  )
}

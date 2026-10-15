import { useState } from 'react'
import type { LocalFileSelection } from '../api/view-model'
import { findOperation } from '../api/view-model'
import { getDemoTask } from '../mocks/tasks'
import { AgentDrawer } from '../components/AgentDrawer'
import { DataFoundationPage } from '../pages/DataFoundationPage'
import { ModelInputPage } from '../pages/ModelInputPage'
import { ProcessPlanningPage } from '../pages/ProcessPlanningPage'
import { ProgramReviewPage } from '../pages/ProgramReviewPage'

type Page = 'input' | 'planning' | 'review' | 'data' | 'interpretation'
const stages: { id: Page; text: string }[] = [
  { id: 'input', text: '01  模型输入' },
  { id: 'planning', text: '02  工艺决策' },
  { id: 'review', text: '03  程序审核' },
]

export default function App() {
  const [page, setPage] = useState<Page>('input')
  const [returnPage, setReturnPage] = useState<Page>('input')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null)
  const [localFile, setLocalFile] = useState<LocalFileSelection | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [onsiteOpen, setOnsiteOpen] = useState(false)
  const [onsiteDraft, setOnsiteDraft] = useState('')
  const [onsiteNotes, setOnsiteNotes] = useState<Record<string, string>>({})
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null)
  const task = taskId ? getDemoTask(taskId) : null
  const selectedOperation = task ? findOperation(task, selectedOperationId) : null
  const acknowledgmentKey = task && selectedOperation ? `${task.id}/${selectedOperation.id}` : null

  function navigate(next: Page) {
    if ((next === 'planning' && !task) || (next === 'review' && !selectedOperation)) return
    setPage(next)
    setAgentOpen(false)
    setOnsiteOpen(false)
  }

  function beginDemo(id: string) {
    const sample = getDemoTask(id)
    if (!sample) return
    setTaskId(sample.id)
    setSelectedOperationId(sample.initialOperationId ?? sample.operations[0]?.id ?? null)
    setLocalFile(null)
    setFileError(null)
    setOnsiteNotes({})
    setAcknowledgedKey(null)
    setAgentOpen(false)
    setOnsiteOpen(false)
    setPage('planning')
  }

  function chooseLocalFile(file: File | null) {
    if (!file) return
    setTaskId(null)
    setSelectedOperationId(null)
    setAcknowledgedKey(null)
    setOnsiteNotes({})
    setAgentOpen(false)
    setLocalFile(null)
    if (!/\.(step|stp)$/i.test(file.name)) {
      setFileError('仅支持 .step 或 .stp 模型文件。该文件未被上传。')
    } else if (file.size > 50 * 1024 * 1024) {
      setFileError('文件超过当前前端演示校验上限（50 MB）；未上传。')
    } else {
      setFileError(null)
      setLocalFile({ fileName: file.name, fileSize: file.size })
    }
    setPage('input')
  }

  function changeFile() {
    setPage('input')
    setTaskId(null)
    setSelectedOperationId(null)
    setLocalFile(null)
    setFileError(null)
    setAcknowledgedKey(null)
    setAgentOpen(false)
    setOnsiteOpen(false)
  }

  function openInformationPanel() {
    setReturnPage(page)
    navigate('interpretation')
  }

  function openFoundation() {
    if (page !== 'data') setReturnPage(page)
    navigate('data')
  }

  function selectOperation(id: string) {
    setSelectedOperationId(id)
    setAcknowledgedKey(null)
    setOnsiteOpen(false)
    setAgentOpen(false)
  }

  function openOnsite() {
    if (!selectedOperation) return
    setOnsiteDraft(onsiteNotes[selectedOperation.id] ?? '')
    setOnsiteOpen(true)
  }

  function saveOnsite() {
    if (!selectedOperation) return
    setOnsiteNotes((notes) => ({ ...notes, [selectedOperation.id]: onsiteDraft.trim() }))
    setAcknowledgedKey(null)
    setOnsiteOpen(false)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>CNC Agentic Programming</h1>
        <div className="top-actions">
          <button
            type="button"
            className="button secondary top-foundation"
            onClick={() =>
              page === 'data'
                ? navigate(returnPage === 'data' ? 'input' : returnPage)
                : openFoundation()
            }
          >
            {page === 'data' ? '返回工作台' : '数据底座'}
          </button>
          <span className="product-label">智能工艺决策</span>
          <span className="prototype-label">r06 / P0 演示</span>
        </div>
      </header>

      {page !== 'data' && page !== 'interpretation' && (
        <>
          <nav className="stage-nav" aria-label="主流程">
            {stages.map((stage) => (
              <button
                type="button"
                key={stage.id}
                className={page === stage.id ? 'stage-tab active' : 'stage-tab'}
                aria-current={page === stage.id ? 'step' : undefined}
                disabled={
                  (stage.id === 'planning' && !task) ||
                  (stage.id === 'review' && !selectedOperation)
                }
                onClick={() => navigate(stage.id)}
              >
                {stage.text}
              </button>
            ))}
          </nav>
          <div className="file-bar">
            <p>
              {task
                ? `${task.fileName} / 当前工序 ${selectedOperation ? String(selectedOperation.sequence).padStart(2, '0') + ' ' + selectedOperation.name : '暂无工序'} / Demo`
                : localFile
                  ? `${localFile.fileName} / 仅本地选择 · 未上传`
                  : '尚未上传模型文件 / 使用示例可预览完整流程'}
            </p>
            <div className="file-actions">
              <button type="button" className="button secondary" onClick={changeFile}>
                更换文件
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={!task}
                onClick={openInformationPanel}
              >
                查看解读结果
              </button>
            </div>
          </div>
        </>
      )}

      <div className="workspace-area">
        {page === 'input' && (
          <ModelInputPage
            currentDemo={task}
            localFile={localFile}
            fileError={fileError}
            onChooseFile={chooseLocalFile}
            onUseDemo={beginDemo}
          />
        )}
        {page === 'planning' && task && (
          <ProcessPlanningPage
            task={task}
            operation={selectedOperation}
            onSelectOperation={selectOperation}
            onOpenOnsite={openOnsite}
            onOpenReview={() => navigate('review')}
          />
        )}
        {page === 'review' && task && (
          <ProgramReviewPage
            task={task}
            operation={selectedOperation}
            acknowledged={acknowledgmentKey !== null && acknowledgedKey === acknowledgmentKey}
            onAcknowledge={() => setAcknowledgedKey(acknowledgmentKey)}
            onReturn={() => navigate('planning')}
          />
        )}
        {page === 'data' && (
          <DataFoundationPage
            onBack={() => navigate(returnPage === 'data' ? 'input' : returnPage)}
          />
        )}
        {page === 'interpretation' && (
          <section className="page-body interpretation-page">
            <div className="page-title-block">
              <h2>设计文件解读</h2>
              <p>当前仅展示功能边界</p>
            </div>
            <div className="empty-state">
              设计特征识别 / STEP 几何解析尚未接入。当前 Mock 工艺数据并不是从上传文件中提取的。
            </div>
            <button type="button" className="button secondary" onClick={() => navigate(returnPage)}>
              返回上一页面
            </button>
          </section>
        )}
      </div>

      <footer className="app-footer">
        P0 Mock 演示 · Agent / CAM 接口待接入；人工确认不等于仿真通过或实际加工验证。
      </footer>

      {(page === 'planning' || page === 'review') && task && (
        <>
          <button
            type="button"
            className="agent-bubble"
            onClick={() => setAgentOpen(!agentOpen)}
            aria-expanded={agentOpen}
          >
            ✦ Agent
          </button>
          <AgentDrawer
            open={agentOpen}
            context={`${task.fileName} / ${selectedOperation ? `${selectedOperation.sequence} ${selectedOperation.name}` : '暂无工序'}`}
            onClose={() => setAgentOpen(false)}
          />
        </>
      )}

      {onsiteOpen && selectedOperation && (
        <div className="modal-backdrop">
          <section
            className="onsite-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onsite-heading"
          >
            <div className="modal-heading">
              <h2 id="onsite-heading">补充现场情况 · Demo</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="关闭现场信息"
                onClick={() => setOnsiteOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="subtle-note">
              工序：{selectedOperation.name}。这里仅保存当前页面的临时草稿，不会修改
              CAM、后端工艺或实际参数。
            </p>
            <label htmlFor="onsite-note">现场补充说明</label>
            <textarea
              id="onsite-note"
              rows={5}
              value={onsiteDraft}
              onChange={(event) => setOnsiteDraft(event.target.value)}
              placeholder="例如：装夹方式和待人工核对项目（勿输入机密生产数据）"
            />
            <div className="bottom-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setOnsiteOpen(false)}
              >
                取消
              </button>
              <button type="button" className="button primary" onClick={saveOnsite}>
                保存演示草稿
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

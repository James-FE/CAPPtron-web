import { lazy, Suspense, useRef, useState } from 'react'
import { useCoreWorkflow } from '../features/core/useCoreWorkflow'
import { CoreInputPreparation } from '../features/core/CoreInputPreparation'
import { AgentBubble } from '../features/agent/AgentBubble'
import { CorePlanningPage } from '../features/core/CorePlanningPage'
const CoreProgramReviewPage = lazy(() =>
  import('../features/core/CoreProgramReviewPage').then((module) => ({
    default: module.CoreProgramReviewPage,
  })),
)
import type { ModelSelection } from '../features/model-input/modelInput'
import { getStepExtension } from '../features/model-input/modelInput'
import { AppShell } from './AppShell'
import { FileInfoBar } from '../features/model-input/FileInfoBar'
import { useModelInput } from '../features/model-input/useModelInput'
import { ModelInputPage } from '../pages/model-input/ModelInputPage'
import { WorkflowWorkspace } from './WorkflowWorkspace'
import type { WorkflowStage } from './WorkflowNavigation'
import { inputExampleCase } from '../api/case-catalog'
import type { DataFoundationReader } from '../api/data-foundation/reader'
import { dataFoundationReader } from './dataFoundation'
import { DataFoundationPage } from '../pages/data-foundation/DataFoundationPage'

export default function App({
  foundationReader = dataFoundationReader,
}: {
  foundationReader?: DataFoundationReader
}) {
  const core = useCoreWorkflow()
  const [realSelection, setRealSelection] = useState<ModelSelection>({ kind: 'empty' })
  const [live, setLive] = useState(Boolean(import.meta.env.VITE_API_BASE_URL))
  const inputRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')
  const { selection, error, selectFiles, selectDemo, sourceVersion } = useModelInput()
  const [stage, setStage] = useState<WorkflowStage>('input')
  const [view, setView] = useState<'workflow' | 'foundation'>('workflow')
  const workspaceRef = useRef<HTMLDivElement>(null)

  function changeView(next: 'workflow' | 'foundation') {
    if (workspaceRef.current?.contains(document.activeElement))
      (document.activeElement as HTMLElement | null)?.blur()
    setView(next)
    setNotice('')
  }

  const inputStatus =
    core.parse?.status === 'parsed'
      ? 'NX 解析完成'
      : core.parse?.status === 'running'
        ? 'NX 正在解析'
        : core.asset
          ? '已上传'
          : '本地选择，待上传'
  const inputLocked =
    core.busy ||
    !!core.planningRun ||
    (!!core.run && ['accepted', 'running', 'awaiting_confirmation'].includes(core.run.status))
  function openFilePicker() {
    if (!inputLocked) inputRef.current?.click()
  }
  function chooseFiles(files: readonly File[]) {
    if (inputLocked) return
    selectFiles(files)
    if (files.length === 1 && getStepExtension(files[0]!.name)) {
      setRealSelection({
        kind: 'local',
        file: files[0]!,
        extension: getStepExtension(files[0]!.name)!,
      })
      core.reset()
      if (import.meta.env.VITE_API_BASE_URL) setLive(true)
      if (live || import.meta.env.VITE_API_BASE_URL) setStage('input')
    }
  }

  return (
    <AppShell
      live={live}
      onToggleLive={() => setLive(!live)}
      currentStage={stage}
      currentView={view}
      onView={changeView}
      onNavigate={(next) => {
        setStage(next)
        setNotice('')
      }}
      onUnavailable={setNotice}
      fileBar={
        <FileInfoBar
          selection={live ? realSelection : selection}
          onReplace={openFilePicker}
          onUnavailable={setNotice}
          statusText={live ? inputStatus : undefined}
          onInterpret={
            live
              ? () => {
                  setStage('input')
                  setNotice(
                    core.parse ? '解析报告位于输入准备区域。' : '请先在输入准备中上传并解析模型。',
                  )
                }
              : undefined
          }
        />
      }
    >
      <div
        ref={workspaceRef}
        className="workflow-view"
        hidden={view !== 'workflow'}
        inert={view !== 'workflow'}
      >
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".step,.stp"
          aria-label="选择 STEP 模型文件"
          tabIndex={-1}
          onChange={(event) => {
            chooseFiles(Array.from(event.currentTarget.files ?? []))
            // 清空控件值以支持重复选择同一文件；有效选择保存在 React 状态中。
            event.currentTarget.value = ''
          }}
        />
        {stage === 'input' && (
          <ModelInputPage
            selection={live ? realSelection : selection}
            error={error}
            onChoose={openFilePicker}
            onFiles={chooseFiles}
            disabled={inputLocked}
            statusText={
              live
                ? selection.kind === 'empty'
                  ? '选择或拖入 STEP / STP'
                  : inputStatus
                : undefined
            }
            preparation={
              live ? (
                <CoreInputPreparation
                  core={core}
                  selection={live ? realSelection : selection}
                  onPlanning={() => setStage('planning')}
                />
              ) : undefined
            }
            onDemo={() => {
              setLive(false)
              selectDemo()
              setStage('planning')
              setNotice('')
            }}
          />
        )}
        <div
          className="workflow-mode"
          hidden={live || stage === 'input'}
          inert={live || stage === 'input'}
        >
          <WorkflowWorkspace
            key={sourceVersion}
            stage={live ? 'input' : stage}
            visible={!live && view === 'workflow'}
            onNavigate={setStage}
            initialCaseReference={selection.kind === 'demo' ? inputExampleCase : undefined}
          />
        </div>
        {live && (
          <div
            className="workflow-mode"
            hidden={!live || stage !== 'planning'}
            inert={!live || stage !== 'planning'}
          >
            <CorePlanningPage core={core} onReview={() => setStage('review')} />
          </div>
        )}
        {live && stage === 'review' && (
          <Suspense fallback={<p role="status">正在加载程序工作台…</p>}>
            <CoreProgramReviewPage core={core} onBack={() => setStage('planning')} />
          </Suspense>
        )}
        {live && stage !== 'input' && view === 'workflow' && (
          <AgentBubble
            onOpen={() =>
              setNotice('Agent 协同尚未接入真实任务；当前可通过参数与资源提交工艺修订。')
            }
          />
        )}
        {live && core.busy && (
          <p className="core-status" role="status">
            正在处理，请稍候…
          </p>
        )}
        {live && core.planningRun && (
          <p className="core-status" role="status">
            工艺规划尚待确认，请刷新工艺后再审核或生成程序。
          </p>
        )}
        {live && core.error && (
          <p className="core-status" role="alert">
            {core.error}
          </p>
        )}
        {stage === 'planning' && error && (
          <p className="availability-notice" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <div className="availability-notice">
            <p role="status">{notice}</p>
            <button type="button" onClick={() => setNotice('')} aria-label="关闭功能提示">
              关闭
            </button>
          </div>
        )}
      </div>
      {view === 'foundation' && <DataFoundationPage reader={foundationReader} />}
    </AppShell>
  )
}

import { useRef, useState } from 'react'
import { CoreWorkspace } from '../features/core/CoreWorkspace'
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
  const [live, setLive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')
  const { selection, error, selectFiles, selectDemo, sourceVersion } = useModelInput()
  const [stage, setStage] = useState<WorkflowStage>('input')
  const [view, setView] = useState<'workflow' | 'foundation'>('workflow')
  const workspaceRef = useRef<HTMLDivElement>(null)

  function changeView(next: 'workflow' | 'foundation') {
    setLive(false)
    if (workspaceRef.current?.contains(document.activeElement))
      (document.activeElement as HTMLElement | null)?.blur()
    setView(next)
    setNotice('')
  }

  function openFilePicker() {
    inputRef.current?.click()
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
        <FileInfoBar selection={selection} onReplace={openFilePicker} onUnavailable={setNotice} />
      }
    >
      {live && <CoreWorkspace />}
      <div
        ref={workspaceRef}
        className="workflow-view"
        hidden={live || view !== 'workflow'}
        inert={live || view !== 'workflow'}
      >
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".step,.stp"
          aria-label="选择 STEP 模型文件"
          tabIndex={-1}
          onChange={(event) => {
            selectFiles(Array.from(event.currentTarget.files ?? []))
            // 清空控件值以支持重复选择同一文件；有效选择保存在 React 状态中。
            event.currentTarget.value = ''
          }}
        />
        {stage === 'input' && (
          <ModelInputPage
            selection={selection}
            error={error}
            onChoose={openFilePicker}
            onFiles={selectFiles}
            onDemo={() => {
              selectDemo()
              setStage('planning')
              setNotice('')
            }}
          />
        )}
        <WorkflowWorkspace
          key={sourceVersion}
          stage={stage}
          visible={view === 'workflow'}
          onNavigate={setStage}
          initialCaseReference={selection.kind === 'demo' ? inputExampleCase : undefined}
        />
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
      {!live && view === 'foundation' && <DataFoundationPage reader={foundationReader} />}
    </AppShell>
  )
}

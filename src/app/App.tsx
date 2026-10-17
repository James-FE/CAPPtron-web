import { useRef, useState } from 'react'
import { AppShell } from './AppShell'
import { FileInfoBar } from '../features/model-input/FileInfoBar'
import { useModelInput } from '../features/model-input/useModelInput'
import { ModelInputPage } from '../pages/model-input/ModelInputPage'
import { ProcessPlanningPage } from '../pages/process-planning/ProcessPlanningPage'

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')
  const { selection, error, selectFiles, selectDemo, sourceVersion } = useModelInput()
  const [stage, setStage] = useState<'input' | 'planning'>('input')

  function openFilePicker() {
    inputRef.current?.click()
  }

  return (
    <AppShell
      currentStage={stage}
      onNavigate={(next) => {
        setStage(next)
        setNotice('')
      }}
      onUnavailable={setNotice}
      fileBar={
        <FileInfoBar selection={selection} onReplace={openFilePicker} onUnavailable={setNotice} />
      }
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
      <ProcessPlanningPage
        key={sourceVersion}
        active={stage === 'planning'}
        initialDemoPlan={selection.kind === 'demo' ? 'ring' : undefined}
        onUnavailable={setNotice}
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
    </AppShell>
  )
}

import type { ChangeEvent } from 'react'
import type { DemoTask, LocalFileSelection } from '../api/view-model'
import { demoTasks } from '../mocks/tasks'

type Props = {
  currentDemo: DemoTask | null
  localFile: LocalFileSelection | null
  fileError: string | null
  onChooseFile: (file: File | null) => void
  onUseDemo: (id: string) => void
}

function describeFileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function ModelInputPage({ currentDemo, localFile, fileError, onChooseFile, onUseDemo }: Props) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChooseFile(event.currentTarget.files?.[0] ?? null)
    event.currentTarget.value = ''
  }

  return (
    <section className="page-body input-page" aria-labelledby="model-input-heading">
      <div className="page-title-block">
        <h2 id="model-input-heading">模型输入</h2>
        <p>上传工序模型 / 设计文件</p>
      </div>
      <div className="input-layout">
        <div className="upload-zone">
          <div className="upload-symbol" aria-hidden="true">＋</div>
          <label className="upload-label" htmlFor="cad-file">选择模型文件</label>
          <input
            id="cad-file"
            type="file"
            className="visually-hidden"
            accept=".step,.stp"
            onChange={handleChange}
          />
          <p className="upload-hint">支持本地选择 STEP / STP · 尚未接入上传或解析服务</p>
          {fileError && <p role="alert" className="message error-message">{fileError}</p>}
          {localFile && (
            <p role="status" className="local-file-message">
              已在本地选择：{localFile.fileName}（{describeFileSize(localFile.fileSize)}）<br />
              文件未上传到服务器，也没有进行几何解析。
            </p>
          )}
          {currentDemo && <p className="local-file-message">当前演示任务：{currentDemo.fileName} · 合成数据</p>}
          <div className="demo-choices">
            <button type="button" className="button primary" onClick={() => onUseDemo('demo-ring')}>
              使用示例 Ring_A.step
            </button>
            <label className="demo-select-label" htmlFor="demo-case">其他测试场景</label>
            <select id="demo-case" defaultValue="" onChange={(event) => {
              if (event.target.value) onUseDemo(event.target.value)
              event.target.value = ''
            }}>
              <option value="">选择合成样例…</option>
              {demoTasks.filter((task) => task.id !== 'demo-ring').map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
          </div>
        </div>
        <aside className="input-preparation" aria-labelledby="input-ready-heading">
          <h3 id="input-ready-heading">输入准备</h3>
          <div className="preparation-lines">
            <p>模型 / 图纸</p>
            <p>制造要求</p>
            <p>工艺模板与上游方案参考</p>
          </div>
          <p className="warning-text">
            示例使用人工构造的工艺数据；<br />
            模型解析与服务端文件存储接口待接入。
          </p>
          <p className="subtle-note">选择本地文件不会自动生成工艺计划。请使用明确标识的演示任务体验当前界面。</p>
        </aside>
      </div>
    </section>
  )
}

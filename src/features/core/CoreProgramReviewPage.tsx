import { useState } from 'react'
import type { CoreWorkflow } from './useCoreWorkflow'
import { ProgramEditor } from '../program-review/ProgramEditor'
export function CoreProgramReviewPage({
  core,
  onBack,
}: {
  core: CoreWorkflow
  onBack: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [fileId, setFileId] = useState('')
  const file = core.files.find((item) => item.fileId === fileId) ?? core.files[0]
  const active =
    !!core.run && ['accepted', 'running', 'awaiting_confirmation'].includes(core.run.status)
  return (
    <section
      className={`program-review-page${expanded ? ' code-expanded' : ''}`}
      aria-labelledby="review-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setExpanded(false)
      }}
    >
      <header className="review-heading">
        <div className="review-title">
          <h2 id="review-title">程序审核</h2>
          <span className="warning-text" role="status">
            {core.nc
              ? `版本 ${core.nc.ref.version} · ${core.nc.review_status === 'pending' ? '待人工审核' : core.nc.review_status}`
              : '尚无可审核正文'}
          </span>
        </div>
        <button className="button" onClick={onBack}>
          返回工艺决策
        </button>
      </header>
      <div className="review-source">
        <p>
          {core.task ? `当前工艺修订 ${core.task.current_revision}` : '尚未选择任务'} ·{' '}
          {core.run ? `CAM ${core.run.status} / ${core.run.phase}` : '尚未执行 CAM'}
        </p>
        <p className="muted-text">仅显示服务端生成结果；NC 修改提交尚未接入。</p>
        <div className="program-tools">
          <button
            className="button primary-button"
            disabled={core.busy || !core.executable || active}
            onClick={() => void core.execute()}
          >
            生成 NC 程序
          </button>
          {core.run && (
            <button
              className="button"
              disabled={core.busy}
              onClick={() => void core.refreshRun(core.run!.cam_run_id)}
            >
              刷新生成状态
            </button>
          )}
          {core.run?.allowed_actions.includes('reconcile') && (
            <button className="button" disabled={core.busy} onClick={() => void core.reconcile()}>
              核实执行结果
            </button>
          )}
          {core.runs.length > 0 && (
            <label>
              已有运行
              <select
                aria-label="已有运行"
                value={core.run?.cam_run_id ?? ''}
                disabled={core.busy}
                onChange={(e) => {
                  if (e.target.value) void core.refreshRun(e.target.value)
                }}
              >
                <option value="">选择运行结果</option>
                {core.runs.map((run) => (
                  <option key={run.cam_run_id} value={run.cam_run_id}>
                    {run.status} · {run.cam_run_id}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      {core.run?.error != null && (
        <details className="core-evidence">
          <summary>执行失败详情</summary>
          <pre>{JSON.stringify(core.run.error, null, 2)}</pre>
        </details>
      )}
      {core.nc ? (
        <div className="program-panel">
          <div className="program-toolbar">
            <div className="program-document-heading">
              <h3>
                {file?.filename} · v{core.nc.ref.version}
              </h3>
            </div>
            <div className="program-tools">
              {core.files.length > 1 && (
                <select
                  aria-label="NC 文件"
                  value={file?.fileId ?? ''}
                  onChange={(e) => setFileId(e.target.value)}
                >
                  {core.files.map((item) => (
                    <option key={item.fileId} value={item.fileId}>
                      {item.filename}
                    </option>
                  ))}
                </select>
              )}
              <button className="button" onClick={() => setExpanded(!expanded)}>
                {expanded ? '退出专注查看' : '展开代码'}
              </button>
            </div>
          </div>
          <div className="program-content">
            <ProgramEditor
              document={{
                id: `${core.nc.ref.cam_run_id}:${core.nc.ref.content_digest}:${file?.fileId}`,
                revision: core.nc.ref.version,
                draftText: file?.text ?? '',
              }}
              readOnly
              onChange={() => {}}
            />
          </div>
          <footer className="program-actions">
            <div>
              <p className="warning-text">审核针对当前 NC 版本；工艺批准不替代制造核验。</p>
              <p className="muted-text">服务端原文 · 不支持浏览器直接改写</p>
            </div>
            <div className="program-tools">
              <label className="core-reviewer">
                审核人
                <input
                  aria-label="审核人 ID"
                  value={core.reviewer}
                  onChange={(e) => core.setReviewer(e.target.value)}
                  disabled={core.busy}
                />
              </label>
              <button
                className="button primary-button"
                disabled={
                  core.busy || !core.reviewer.trim() || !core.nc.allowed_actions.includes('review')
                }
                onClick={() => void core.approveNc()}
              >
                批准当前 NC
              </button>
              <button
                className="button"
                disabled={core.busy || !core.nc.allowed_actions.includes('download')}
                onClick={() => void core.download()}
              >
                下载批准版本
              </button>
            </div>
          </footer>
        </div>
      ) : (
        <div className="review-empty">
          <h3>{active ? '正在生成程序…' : '程序正文暂不可用'}</h3>
          <p>
            {core.executable
              ? '可生成新程序，或选择已有运行读取结果。'
              : '当前工艺尚未获得匹配的批准及执行配置。'}
          </p>
          <p>仅进入此页面不会自动执行 Mastercam。</p>
        </div>
      )}
    </section>
  )
}

import type { CoreWorkflow } from './useCoreWorkflow'
import type { ModelSelection } from '../model-input/modelInput'
import { goldenTemplate } from '../../api/core/golden'
export function CoreInputPreparation({
  core,
  selection,
  onPlanning,
}: {
  core: CoreWorkflow
  selection: ModelSelection
  onPlanning: () => void
}) {
  return (
    <section className="input-preparation" aria-labelledby="preparation-title">
      <h3 id="preparation-title">输入准备</h3>
      <dl className="preparation-items">
        <div>
          <dt>模型 / 图纸</dt>
          <dd aria-live="polite">
            {core.parse?.status === 'parsed'
              ? 'NX 解析完成'
              : core.parse?.status === 'running'
                ? 'NX 正在解析'
                : core.parse?.status === 'failed'
                  ? '解析失败'
                  : core.asset
                    ? '已上传，待解析'
                    : selection.kind === 'local'
                      ? '本地已选择，待上传'
                      : '待选择'}
          </dd>
        </div>
        <div>
          <dt>制造要求</dt>
          <dd>Golden-B7 圆环 · 2024 铝 · 切断侧外圆 C0.2×45°</dd>
        </div>
        <div>
          <dt>工艺模板与上游方案参考</dt>
          <dd>Golden-B7 · {goldenTemplate.version} · 七工序固定模板</dd>
        </div>
      </dl>
      <div className="input-live-actions">
        {!core.asset && (
          <button
            className="button primary-button"
            disabled={core.busy || selection.kind !== 'local'}
            onClick={() => {
              if (selection.kind === 'local') void core.upload(selection.file)
            }}
          >
            上传模型
          </button>
        )}
        {core.asset && !core.parse && (
          <button
            className="button primary-button"
            disabled={core.busy}
            onClick={() => void core.parseAsset()}
          >
            开始解析
          </button>
        )}
        {core.parseCommand && (
          <button className="button" disabled={core.busy} onClick={() => void core.refreshParse()}>
            刷新解析状态
          </button>
        )}
        {core.parse?.status === 'parsed' && (
          <button
            className="button primary-button"
            disabled={core.busy}
            onClick={() =>
              void (async () => {
                if (!core.task && !(await core.createTask())) return
                onPlanning()
              })()
            }
          >
            进入工艺决策
          </button>
        )}
        {core.task && !core.parse && (
          <button className="button" onClick={onPlanning}>
            查看已有工艺
          </button>
        )}
      </div>
      <p className="preparation-note">解析成功后匹配模板；工艺批准后生成待审核 NC。</p>
      <details className="core-recovery">
        <summary>恢复已有任务</summary>
        <label>
          任务 ID
          <input
            value={core.taskId}
            onChange={(e) => core.setTaskId(e.target.value)}
            disabled={core.busy}
          />
        </label>
        <button
          className="button"
          disabled={core.busy || !core.taskId.trim()}
          onClick={() => void core.refreshTask()}
        >
          读取任务
        </button>
      </details>
      {core.parse && (
        <details className="core-evidence">
          <summary>解析报告</summary>
          <pre>{JSON.stringify(core.parse, null, 2)}</pre>
        </details>
      )}
    </section>
  )
}

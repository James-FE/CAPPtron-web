import type { DemoTask, ProcessOperation } from '../api/view-model'
import { OperationList } from '../features/operations/OperationList'

type Props = {
  task: DemoTask
  operation: ProcessOperation | null
  onSelectOperation: (id: string) => void
  onOpenOnsite: () => void
  onOpenReview: () => void
}

export function ProcessPlanningPage({
  task,
  operation,
  onSelectOperation,
  onOpenOnsite,
  onOpenReview,
}: Props) {
  return (
    <section className="page-body planning-page" aria-labelledby="planning-heading">
      <div className="page-title-block">
        <h2 id="planning-heading">工艺决策</h2>
        <p>工艺规划 · 参数推荐 · 生产资源匹配</p>
      </div>
      <div className="planning-grid">
        <OperationList
          operations={task.operations}
          selectedId={operation?.id ?? null}
          onSelect={onSelectOperation}
        />
        <article className="operation-detail" aria-live="polite" aria-label="工步详情">
          {operation ? (
            <>
              <div className="operation-detail-head">
                <h3>
                  {String(operation.sequence).padStart(2, '0')} {operation.name}
                </h3>
                <p>来源：{operation.source}</p>
              </div>
              <div className="operation-detail-content custom-scroll">
                <div className="detail-group">
                  <h4>装夹与定位</h4>
                  <p>{operation.setup ?? '该工序暂无装夹与定位信息；不自动补全。'}</p>
                </div>
                <div className="detail-group">
                  <h4>加工内容 / 工步</h4>
                  {operation.steps.length ? (
                    <ol className="steps-list">
                      {operation.steps.map((step) => (
                        <li key={step.id}>{step.description}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="missing-value">暂无工步数据（保持为空）。</p>
                  )}
                </div>
                {operation.measurements.length > 0 && (
                  <div className="detail-group warning-group">
                    <h4>待人工实测</h4>
                    {operation.measurements.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                )}
                <div className="detail-group">
                  <h4>生产资源 · Demo</h4>
                  {operation.resources.length ? (
                    <dl className="property-list">
                      {operation.resources.map((value) => (
                        <div key={value.id}>
                          <dt>{value.label}</dt>
                          <dd>
                            {value.value}
                            <small>{value.source}</small>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="missing-value">暂无资源匹配结果。</p>
                  )}
                </div>
                <div className="detail-group">
                  <h4>推荐切削参数 · Mock</h4>
                  {operation.parameters.length ? (
                    <dl className="property-list">
                      {operation.parameters.map((value) => (
                        <div key={value.id}>
                          <dt>{value.label}</dt>
                          <dd>
                            {value.value}
                            <small>{value.source}</small>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="missing-value">暂无切削参数，不推断数值。</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">当前任务没有工序，无法展示工步或生成程序预览。</div>
          )}
        </article>
      </div>
      <div className="planning-bottom">
        <p className="muted-note">工步信息仅为合成演示；缺失工步保持为空，不代表真实工艺决策。</p>
        <div className="bottom-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onOpenOnsite}
            disabled={!operation}
          >
            补充 / 确认工序信息
          </button>
          <button
            type="button"
            className="button primary"
            onClick={onOpenReview}
            disabled={!operation}
          >
            进入程序审核 · Demo
          </button>
        </div>
      </div>
    </section>
  )
}

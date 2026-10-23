import { useMemo, useState } from 'react'
import type { CoreWorkflow } from './useCoreWorkflow'
import { toProcessPlan } from '../../api/core/viewModel'
import { OperationDetails } from '../process-planning/OperationDetails'
import type { DetailView } from '../process-planning/OperationDetails'
import { draftKey } from '../process-planning/processPlan'
export function CorePlanningPage({ core, onReview }: { core: CoreWorkflow; onReview: () => void }) {
  const [selected, setSelected] = useState('')
  const [view, setView] = useState<DetailView>('steps')
  const plan = useMemo(
    () =>
      core.task && core.plan
        ? toProcessPlan(core.plan, core.task, core.asset?.filename ?? '当前模型')
        : undefined,
    [core.task, core.plan, core.asset],
  )
  const operation = plan?.operations.find((op) => op.id === selected) ?? plan?.operations[0]
  const roughKey = core.roughOperation
    ? draftKey(core.roughOperation.id, 'parameters', 'rough_step')
    : ''
  const value = core.draftValue
  const changed =
    value !== undefined && Number(value) !== core.roughOperation?.attributes.parameters?.rough_step
  const valid =
    value !== undefined && !!value.trim() && Number.isFinite(Number(value)) && Number(value) > 0
  return (
    <section className="process-planning-page" aria-labelledby="core-planning-title">
      <header className="planning-heading">
        <div>
          <h2 id="core-planning-title">工艺决策</h2>
          <p className="page-subtitle">工艺规划 · 参数推荐 · 生产资源匹配</p>
        </div>
        <div className="program-tools">
          <button
            className="button"
            disabled={core.busy || !core.task || !!core.planningRun}
            onClick={() => void core.generate()}
          >
            生成模板工艺
          </button>
          <button
            className="button"
            disabled={core.busy || !core.taskId}
            onClick={() => void core.refreshTask()}
          >
            刷新工艺
          </button>
        </div>
      </header>
      <p className="plan-source">
        {plan
          ? `${plan.partName} · ${plan.sourceDescription} · ${plan.operations.length} 道工序`
          : '请先在模型输入完成上传与解析，再匹配工艺模板。'}
      </p>
      {plan ? (
        <div className="decision-columns">
          <aside className="planning-sidebar" aria-label="任务信息与工序">
            <div className="operation-sidebar-list">
              <div className="operation-list-heading">
                <p className="list-heading">工序 · {plan.operations.length}</p>
              </div>
              <nav className="operation-list" aria-label="工序列表">
                {plan.operations.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    className="button operation-button"
                    aria-pressed={operation?.id === op.id}
                    onClick={() => setSelected(op.id)}
                  >
                    <span>{String(op.sequence).padStart(2, '0')}</span>
                    <span>{op.name}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>
          {operation ? (
            <OperationDetails
              plan={plan}
              operation={operation}
              view={view}
              onView={setView}
              drafts={value === undefined ? {} : { [roughKey]: value }}
              onDraft={(key, next) => {
                if (key === roughKey) core.setDraftValue(next)
              }}
            />
          ) : (
            <div className="planning-empty">
              <h3>暂无工序详情</h3>
            </div>
          )}
        </div>
      ) : (
        <div className="planning-empty">
          <h3>{core.busy ? '正在读取工艺…' : '暂无可用工艺方案'}</h3>
          <p>
            {core.task
              ? '任务已创建，点击“生成模板工艺”开始匹配。'
              : '从模型输入开始，或恢复已有任务。'}
          </p>
        </div>
      )}
      <footer className="planning-actions">
        <div>
          <p className="muted-text">
            {changed
              ? '参数已修改，请提交修订后重新批准。'
              : core.executable
                ? '当前工艺已批准，可进入程序审核生成 NC。'
                : '请核对工步及参数，批准当前工艺后生成 NC。'}
          </p>
          <p className="warning-text">工艺批准不代表 NC 制造放行。</p>
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
            className="button"
            disabled={core.busy || !changed || !valid || !!core.planningRun}
            onClick={() => void core.revise(Number(value))}
          >
            提交参数修订
          </button>
          <button
            className="button"
            disabled={
              core.busy ||
              changed ||
              !!core.planningRun ||
              !core.task ||
              core.card?.status !== 'ready' ||
              !core.reviewer.trim()
            }
            onClick={() => void core.approvePlan()}
          >
            批准当前工艺
          </button>
          <button
            className="button primary-button"
            disabled={changed || core.busy || !plan}
            onClick={onReview}
          >
            进入程序审核
          </button>
        </div>
      </footer>
    </section>
  )
}

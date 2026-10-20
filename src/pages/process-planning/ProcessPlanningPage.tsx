import { PlanningSourceSelector } from '../../features/process-planning/PlanningSourceSelector'
import { OperationDetails } from '../../features/process-planning/OperationDetails'
import { TaskMeasurements } from '../../features/process-planning/TaskMeasurements'
import { DemoPlanningProgress } from '../../features/process-planning/DemoPlanningProgress'
import type { WorkflowSession } from '../../features/process-planning/useWorkflowSession'

export function ProcessPlanningPage({
  active,
  workflow,
  onReview,
}: {
  active: boolean
  workflow: WorkflowSession
  onReview: () => void
}) {
  const {
    session,
    operation,
    readiness,
    taskMissing,
    operationMissing,
    operationPending,
    fieldView,
    selectedButtonRef,
    updateSession,
    loadDemo,
    selectOperation,
    updateDraft,
    demoChoice,
    setDemoChoice,
    caseLoad,
    setCaseLoad,
    setCaseRequest,
  } = workflow
  return (
    <section className="process-planning-page" hidden={!active} aria-labelledby="planning-title">
      <header className="planning-heading">
        <div>
          <h2 id="planning-title">工艺决策</h2>
          <p className="page-subtitle">工艺规划 · 参数推荐 · 生产资源匹配</p>
        </div>
        <PlanningSourceSelector
          active={active}
          choice={demoChoice}
          onChoice={setDemoChoice}
          onLoad={loadDemo}
        />
      </header>
      <p className="plan-source">
        {session
          ? `${session.plan.partName} · ${session.plan.sourceDescription}`
          : '本地模型选择不代表已生成工艺计划；Demo 方案需显式加载。'}
      </p>
      {caseLoad.state !== 'idle' ? (
        <div className="planning-empty">
          {caseLoad.state === 'loading' ? (
            <h3 role="status">正在加载并校验参考案例…</h3>
          ) : (
            <>
              <h3>参考案例加载失败</h3>
              <p role="alert">{caseLoad.message}</p>
              <button
                className="button"
                onClick={() => {
                  setCaseLoad({ state: 'loading' })
                  setCaseRequest((current) =>
                    current ? { ...current, attempt: current.attempt + 1 } : null,
                  )
                }}
              >
                重试案例加载
              </button>
            </>
          )}
        </div>
      ) : session && !session.resultViewed ? (
        <DemoPlanningProgress
          key={session.plan.id}
          startedAt={session.startedAt}
          partName={session.plan.partName}
          onView={() => updateSession((current) => ({ ...current, resultViewed: true }))}
        />
      ) : session ? (
        <div className="decision-columns">
          <aside className="planning-sidebar" aria-label="任务信息与工序">
            {!!session.plan.taskMeasurements?.length && (
              <div className="task-information-entry">
                <button
                  className="button task-information-button"
                  aria-pressed={session.view === 'task'}
                  onClick={() => updateSession((current) => ({ ...current, view: 'task' }))}
                >
                  <span>任务共用信息</span>
                  <span className={`input-badge ${taskMissing ? '' : 'draft-complete'}`}>
                    {taskMissing ? `待填 ${taskMissing}` : '已补齐'}
                  </span>
                </button>
                <p className="muted-text">所有工序共享 · 集中填写一次</p>
              </div>
            )}
            <div className="operation-sidebar-list">
              <div className="operation-list-heading">
                <p className="list-heading">工序 · {session.plan.operations.length}</p>
                {!!operationMissing.length && (
                  <button
                    className="button pending-operation-jump"
                    aria-label={`定位待填工序，${operationMissing.length} 项`}
                    onClick={() => {
                      const next = operationMissing[0]!
                      updateSession((current) => ({
                        ...current,
                        selectedId: next.operationId,
                        view: fieldView(next.section),
                      }))
                    }}
                  >
                    待填 {operationMissing.length} 项 ↓
                  </button>
                )}
              </div>
              <nav className="operation-list" aria-label="工序列表">
                {!session.plan.operations.length && <p className="muted-text">当前方案没有工序</p>}
                {session.plan.operations.map((item) => (
                  <button
                    key={item.id}
                    ref={operation?.id === item.id ? selectedButtonRef : undefined}
                    type="button"
                    className="button operation-button"
                    aria-pressed={session.view !== 'task' && operation?.id === item.id}
                    onClick={() => selectOperation(item.id)}
                    title={
                      operationPending(item.id).length
                        ? `有 ${operationPending(item.id).length} 项工序专用必填信息需要补充或修正`
                        : undefined
                    }
                  >
                    <span>{String(item.sequence).padStart(2, '0')}</span>
                    <span>{item.name}</span>
                    {!!operationPending(item.id).length && (
                      <span className="input-badge">待填 {operationPending(item.id).length}</span>
                    )}
                  </button>
                ))}
              </nav>
            </div>
          </aside>
          {session.view === 'task' ? (
            <TaskMeasurements
              plan={session.plan}
              drafts={session.drafts}
              onDraft={updateDraft}
              missingCount={taskMissing}
            />
          ) : operation ? (
            <OperationDetails
              plan={session.plan}
              operation={operation}
              view={session.view}
              onView={(view) => updateSession((current) => ({ ...current, view }))}
              drafts={session.drafts}
              onDraft={updateDraft}
            />
          ) : (
            <div className="planning-empty">
              <h3>暂无工序详情</h3>
              <p>当前方案包含零道工序，未自动补入示例数据。</p>
            </div>
          )}
        </div>
      ) : (
        <div className="planning-empty">
          <h3>暂无可用工艺方案</h3>
          <p>尚未接入工艺模板或上游方案。可在右上角显式加载独立的 Demo 案例。</p>
          <p className="muted-text">所选本地 STEP 文件未上传、未解析，也不会与演示工艺自动关联。</p>
        </div>
      )}
      {(!session || session.resultViewed) && (
        <footer className="planning-actions">
          <p className="muted-text" id="planning-readiness">
            {!session
              ? '请先加载演示方案。'
              : readiness?.missing.length
                ? `还有 ${readiness.missing.length} 项必填信息待补充；填写完整且格式有效后启用审核入口。`
                : !readiness?.ready
                  ? '工序或工步信息不完整，暂不能进入下一步。'
                  : '必填信息已补齐 · 仅完成演示填写，未完成制造校核。'}
            <br />
            Mock 方案未经机加工专家确认。
          </p>
          <div>
            <button
              type="button"
              className="button"
              disabled={!operation && !session?.plan.taskMeasurements?.length}
              onClick={() => {
                const next = readiness?.missing.find((item) => item.parameter.editable)
                updateSession((current) => ({
                  ...current,
                  selectedId:
                    next?.section === 'task'
                      ? current.selectedId
                      : (next?.operationId ?? current.selectedId),
                  view: next
                    ? fieldView(next.section)
                    : session?.plan.taskMeasurements?.length
                      ? 'task'
                      : 'onsite',
                }))
              }}
            >
              补充工序信息
            </button>
            <button
              type="button"
              className="button primary-button"
              disabled={!readiness?.ready}
              aria-describedby="planning-readiness"
              onClick={onReview}
            >
              查看参考程序并进入审核
            </button>
          </div>
        </footer>
      )}
    </section>
  )
}

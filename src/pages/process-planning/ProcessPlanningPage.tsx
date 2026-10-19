import { useEffect, useRef, useState } from 'react'
import { loadDemoPlan } from '../../api/mock/processPlans'
import type { DemoPlanId } from '../../api/mock/processPlans'
import { caseCatalogReader, caseChoiceKey } from '../../api/case-catalog'
import { caseToProcessPlan } from '../../api/case-catalog/adapter'
import { PlanningSourceSelector } from '../../features/process-planning/PlanningSourceSelector'
import { OperationDetails } from '../../features/process-planning/OperationDetails'
import { TaskMeasurements } from '../../features/process-planning/TaskMeasurements'
import type { DetailView } from '../../features/process-planning/OperationDetails'
import type { Drafts } from '../../features/process-planning/ParameterFields'
import { getPlanReadiness, resolveOperation } from '../../features/process-planning/processPlan'
import { DemoPlanningProgress } from '../../features/process-planning/DemoPlanningProgress'
import type { ProcessPlan } from '../../features/process-planning/processPlan'
import { AgentBubble } from '../../features/agent/AgentBubble'
import { AgentDrawer } from '../../features/agent/AgentDrawer'
import { createDemoExchange } from '../../features/agent/agentSession'
import type { AgentMessage } from '../../features/agent/agentSession'

type PlanningSession = {
  plan: ProcessPlan
  selectedId: string | null
  view: DetailView | 'task'
  drafts: Drafts
  messages: AgentMessage[]
  input: string
  startedAt: number
  resultViewed: boolean
}

function createSession(plan: ProcessPlan): PlanningSession {
  return {
    plan,
    selectedId: plan.initialOperationId ?? null,
    view: 'steps',
    drafts: {},
    messages: [],
    input: '',
    startedAt: Date.now(),
    resultViewed: false,
  }
}

export function ProcessPlanningPage({
  active,
  onUnavailable,
  initialCaseReference,
}: {
  active: boolean
  onUnavailable: (message: string) => void
  initialCaseReference?: { caseId: string; version: string }
}) {
  const [demoChoice, setDemoChoice] = useState(
    initialCaseReference
      ? caseChoiceKey(initialCaseReference.caseId, initialCaseReference.version)
      : 'simple',
  )
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Record<string, PlanningSession>>({})
  const [caseRequest, setCaseRequest] = useState(
    initialCaseReference ? { ...initialCaseReference, attempt: 0 } : null,
  )
  const [caseLoad, setCaseLoad] = useState<{
    state: 'idle' | 'loading' | 'error'
    message?: string
  }>({ state: initialCaseReference ? 'loading' : 'idle' })
  useEffect(() => {
    if (!caseRequest) return
    let cancelled = false
    caseCatalogReader
      .getCaseVersion(caseRequest.caseId, caseRequest.version)
      .then((document) => {
        if (cancelled) return
        const plan = caseToProcessPlan(document)
        setSessions((current) =>
          current[plan.id] ? current : { ...current, [plan.id]: createSession(plan) },
        )
        setCurrentId(plan.id)
        setCaseLoad({ state: 'idle' })
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setCaseLoad({
            state: 'error',
            message: reason instanceof Error ? reason.message : '案例加载失败',
          })
      })
    return () => {
      cancelled = true
    }
  }, [caseRequest])
  const [agentOpen, setAgentOpen] = useState(false)
  const session = currentId ? sessions[currentId] : undefined
  const operation = session ? resolveOperation(session.plan, session.selectedId) : null
  const readiness = session ? getPlanReadiness(session.plan, session.drafts) : null
  const taskMissing = readiness?.missing.filter((item) => item.section === 'task').length ?? 0
  const operationMissing =
    readiness?.missing.filter((item) => item.section !== 'task' && item.parameter.editable) ?? []
  function operationPending(id: string) {
    return (
      readiness?.missing.filter(
        (item) => item.section !== 'task' && item.operationId === id && item.parameter.editable,
      ) ?? []
    )
  }
  function fieldView(section: string): DetailView | 'task' {
    return section === 'task'
      ? 'task'
      : section === 'onsite'
        ? 'onsite'
        : section === 'parameters'
          ? 'resources'
          : 'steps'
  }
  const selectedButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active && session?.resultViewed)
      selectedButtonRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [active, operation?.id, session?.resultViewed])
  function updateSession(update: (current: PlanningSession) => PlanningSession) {
    if (!currentId) return
    setSessions((current) => {
      const existing = current[currentId]
      return existing ? { ...current, [currentId]: update(existing) } : current
    })
  }
  function loadDemo(reference?: { caseId: string; version: string }) {
    if (reference) {
      setCurrentId(null)
      setCaseLoad({ state: 'loading' })
      setCaseRequest({ caseId: reference.caseId, version: reference.version, attempt: Date.now() })
      return
    }
    setCaseRequest(null)
    setCaseLoad({ state: 'idle' })
    const plan = loadDemoPlan(demoChoice as DemoPlanId)
    setSessions((current) =>
      current[plan.id]
        ? current
        : {
            ...current,
            [plan.id]: createSession(plan),
          },
    )
    setCurrentId(plan.id)
  }
  function selectOperation(id: string) {
    if (!id) {
      updateSession((current) => ({ ...current, view: 'task' }))
      return
    }
    updateSession((current) => ({
      ...current,
      selectedId: id,
      view:
        current.view === 'task'
          ? fieldView(operationPending(id)[0]?.section ?? 'steps')
          : current.view,
    }))
  }
  function updateDraft(key: string, value: string) {
    updateSession((current) => ({ ...current, drafts: { ...current.drafts, [key]: value } }))
  }
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
                ? `还有 ${readiness.missing.length} 项必填信息待补充；填写完整且格式有效后启用生成入口。`
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
              onClick={() =>
                onUnavailable(
                  '程序审核属于 FE-003，当前尚未开放；未调用 CAM，未生成或验证 NC 程序。',
                )
              }
            >
              生成程序并进入审核
            </button>
          </div>
        </footer>
      )}
      {active && <AgentBubble onOpen={() => setAgentOpen(true)} />}
      <AgentDrawer
        open={active && agentOpen}
        onClose={() => setAgentOpen(false)}
        plan={session?.plan ?? null}
        operationId={session?.view === 'task' ? null : (operation?.id ?? null)}
        onOperation={selectOperation}
        messages={session?.messages ?? []}
        input={session?.input ?? ''}
        onInput={(input) => updateSession((current) => ({ ...current, input }))}
        onSend={() => {
          if (!session?.input.trim()) return
          const messageOperation = session.view === 'task' ? null : operation
          const context =
            session.view === 'task'
              ? '任务级 · 共用信息'
              : operation
                ? `${operation.sequence} ${operation.name}`
                : '任务级 · 暂无工序'
          updateSession((current) => ({
            ...current,
            input: '',
            messages: [
              ...current.messages,
              ...createDemoExchange(current.input.trim(), messageOperation?.id ?? null, context),
            ],
          }))
        }}
      />
    </section>
  )
}

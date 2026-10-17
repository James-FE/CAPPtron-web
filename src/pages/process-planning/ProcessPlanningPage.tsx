import { useEffect, useRef, useState } from 'react'
import { demoPlanOptions, loadDemoPlan } from '../../api/mock/processPlans'
import type { DemoPlanId } from '../../api/mock/processPlans'
import { OperationDetails } from '../../features/process-planning/OperationDetails'
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
  view: DetailView
  drafts: Drafts
  messages: AgentMessage[]
  input: string
  startedAt: number
  resultViewed: boolean
}

function createSession(id: DemoPlanId): PlanningSession {
  const plan = loadDemoPlan(id)
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
  initialDemoPlan,
}: {
  active: boolean
  onUnavailable: (message: string) => void
  initialDemoPlan?: DemoPlanId
}) {
  const [demoChoice, setDemoChoice] = useState<DemoPlanId>(initialDemoPlan ?? 'simple')
  const [currentId, setCurrentId] = useState<DemoPlanId | null>(initialDemoPlan ?? null)
  const [sessions, setSessions] = useState<Partial<Record<DemoPlanId, PlanningSession>>>(() =>
    initialDemoPlan ? { [initialDemoPlan]: createSession(initialDemoPlan) } : {},
  )
  const [agentOpen, setAgentOpen] = useState(false)
  const session = currentId ? sessions[currentId] : undefined
  const operation = session ? resolveOperation(session.plan, session.selectedId) : null
  const readiness = session ? getPlanReadiness(session.plan, session.drafts) : null
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
  function loadDemo() {
    setSessions((current) =>
      current[demoChoice]
        ? current
        : {
            ...current,
            [demoChoice]: createSession(demoChoice),
          },
    )
    setCurrentId(demoChoice)
  }
  function selectOperation(id: string) {
    updateSession((current) => ({ ...current, selectedId: id }))
  }
  return (
    <section className="process-planning-page" hidden={!active} aria-labelledby="planning-title">
      <header className="planning-heading">
        <div>
          <h2 id="planning-title">工艺决策</h2>
          <p className="page-subtitle">工艺规划 · 参数推荐 · 生产资源匹配</p>
        </div>
        <div className="demo-loader">
          <label htmlFor="demo-plan">演示方案</label>
          <select
            id="demo-plan"
            value={demoChoice}
            onChange={(event) => setDemoChoice(event.target.value as DemoPlanId)}
          >
            {demoPlanOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="button" onClick={loadDemo}>
            加载 Demo 方案
          </button>
        </div>
      </header>
      <p className="plan-source">
        {session
          ? `${session.plan.partName} · ${session.plan.sourceDescription}`
          : '本地模型选择不代表已生成工艺计划；Demo 方案需显式加载。'}
      </p>
      {session && !session.resultViewed ? (
        <DemoPlanningProgress
          key={session.plan.id}
          startedAt={session.startedAt}
          partName={session.plan.partName}
          onView={() => updateSession((current) => ({ ...current, resultViewed: true }))}
        />
      ) : session ? (
        <div className="decision-columns">
          <nav className="operation-list" aria-label="工序列表">
            <p className="list-heading">工序 · {session.plan.operations.length}</p>
            {!session.plan.operations.length && <p className="muted-text">当前方案没有工序</p>}
            {session.plan.operations.map((item) => (
              <button
                key={item.id}
                ref={operation?.id === item.id ? selectedButtonRef : undefined}
                type="button"
                className="button operation-button"
                aria-pressed={operation?.id === item.id}
                onClick={() => selectOperation(item.id)}
              >
                <span>{String(item.sequence).padStart(2, '0')}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
          {operation ? (
            <OperationDetails
              plan={session.plan}
              operation={operation}
              view={session.view}
              onView={(view) => updateSession((current) => ({ ...current, view }))}
              drafts={session.drafts}
              onDraft={(key, value) =>
                updateSession((current) => ({
                  ...current,
                  drafts: { ...current.drafts, [key]: value },
                }))
              }
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
              disabled={!operation}
              onClick={() => {
                const next = readiness?.missing.find((item) => item.parameter.editable)
                updateSession((current) => ({
                  ...current,
                  selectedId:
                    next?.section === 'task'
                      ? current.selectedId
                      : (next?.operationId ?? current.selectedId),
                  view: next
                    ? next.section === 'onsite' || next.section === 'task'
                      ? 'onsite'
                      : next.section === 'parameters'
                        ? 'resources'
                        : 'steps'
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
        operationId={operation?.id ?? null}
        onOperation={selectOperation}
        messages={session?.messages ?? []}
        input={session?.input ?? ''}
        onInput={(input) => updateSession((current) => ({ ...current, input }))}
        onSend={() => {
          if (!session?.input.trim()) return
          const context = operation
            ? `${operation.sequence} ${operation.name}`
            : '任务级 · 暂无工序'
          updateSession((current) => ({
            ...current,
            input: '',
            messages: [
              ...current.messages,
              ...createDemoExchange(current.input.trim(), operation?.id ?? null, context),
            ],
          }))
        }}
      />
    </section>
  )
}

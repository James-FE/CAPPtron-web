import { supplementFields } from '../api/core/supplement'
import { useWorkflowSession } from '../features/process-planning/useWorkflowSession'
import { ProcessPlanningPage } from '../pages/process-planning/ProcessPlanningPage'
import { lazy, Suspense, useEffect } from 'react'
const ProgramReviewPage = lazy(() =>
  import('../pages/program-review/ProgramReviewPage').then((module) => ({
    default: module.ProgramReviewPage,
  })),
)
import { AgentBubble } from '../features/agent/AgentBubble'
import { AgentDrawer } from '../features/agent/AgentDrawer'
import { createDemoExchange } from '../features/agent/agentSession'
import type { WorkflowStage } from './WorkflowNavigation'
import type { LiveWorkflow } from '../features/core/useLiveWorkflow'
import {
  draftKey,
  getPlanReadiness,
  resolveOperation,
} from '../features/process-planning/processPlan'

export function WorkflowWorkspace({
  stage,
  onNavigate,
  initialCaseReference,
  visible = true,
  live,
}: {
  stage: WorkflowStage
  onNavigate: (stage: WorkflowStage) => void
  initialCaseReference?: { caseId: string; version: string }
  visible?: boolean
  live?: LiveWorkflow
}) {
  const demo = useWorkflowSession(visible && stage === 'planning' && !live, initialCaseReference)
  const liveMissing = live?.session
    ? getPlanReadiness(live.session.plan, live.session.drafts).missing
    : []
  const workflow = live
    ? {
        ...demo,
        session: live.session,
        operation: live.session
          ? resolveOperation(live.session.plan, live.session.selectedId)
          : null,
        readiness: live.session ? getPlanReadiness(live.session.plan, live.session.drafts) : null,
        taskMissing: liveMissing.filter((x) => x.section === 'task').length,
        operationMissing: liveMissing.filter((x) => x.section !== 'task'),
        operationPending: (id: string) =>
          liveMissing.filter((x) => x.section !== 'task' && x.operationId === id),
        caseLoad: { state: 'idle' as const },
        agentOpen: live.agentOpen,
        setAgentOpen: live.setAgentOpen,
        updateSession: live.updateSession,
        selectOperation: (id: string) =>
          live.updateSession((s) => ({
            ...s,
            selectedId: id,
            view: s.view === 'task' ? 'steps' : s.view,
          })),
        updateDraft: (key: string, value: string) =>
          live.updateSession((s) => {
            const parameter = [
              ...supplementFields(s.plan),
              ...s.plan.operations.flatMap((op) =>
                op.parameters.map((p) => ({ key: draftKey(op.id, 'parameters', p.id), p })),
              ),
            ].find((p) => p.key === key)?.p
            if (!parameter?.editable) return s
            const drafts = { ...s.drafts, [key]: value }
            if (value === String(parameter.value)) delete drafts[key]
            return { ...s, drafts }
          }),
      }
    : demo
  const { session, operation, selectOperation, updateSession, agentOpen, setAgentOpen } = workflow
  useEffect(() => {
    if (!visible) setAgentOpen(false)
  }, [visible, setAgentOpen])
  const programContext = `${session?.plan.caseReference?.caseId ?? '无参考案例'} / ${session?.plan.caseReference?.version ?? '—'} · 程序审核 · ${session?.program ? `${session.program.source === 'historical_reference' ? '历史参考' : session.program.source === 'demo_fixture' ? '不可执行测试文本' : 'CAM 来源'} · 修订 r${session.program.revision}` : '正文不可用'} · 本次未执行 CAM`
  return (
    <>
      <ProcessPlanningPage
        live={live}
        active={visible && stage === 'planning'}
        workflow={workflow}
        onReview={() => onNavigate('review')}
      />
      {stage === 'review' && (
        <Suspense fallback={<p role="status">正在加载程序工作台…</p>}>
          <ProgramReviewPage
            live={live}
            active={visible}
            workflow={workflow}
            onBack={() => onNavigate('planning')}
            onOpenAgent={() => setAgentOpen(true)}
          />
        </Suspense>
      )}
      {visible && stage !== 'input' && <AgentBubble onOpen={() => setAgentOpen(true)} />}
      {
        <AgentDrawer
          unavailableReason={live ? 'Agent 服务尚未接入，暂不能发送消息。' : undefined}
          open={visible && stage !== 'input' && agentOpen}
          onClose={() => setAgentOpen(false)}
          plan={session?.plan ?? null}
          programContext={
            stage === 'review'
              ? live
                ? `${live.task?.task_id ?? '无任务'} · NC v${live.nc?.ref.version ?? '—'} · ${live.simulation ? '模拟' : '服务端'}正文`
                : programContext
              : undefined
          }
          operationId={session?.view === 'task' ? null : (operation?.id ?? null)}
          onOperation={selectOperation}
          messages={session?.messages ?? []}
          input={session?.input ?? ''}
          onInput={(input) => updateSession((current) => ({ ...current, input }))}
          onSend={() => {
            if (live || !session?.input.trim()) return
            const messageOperation = session.view === 'task' ? null : operation
            const context =
              stage === 'review'
                ? programContext
                : session.view === 'task'
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
      }
    </>
  )
}

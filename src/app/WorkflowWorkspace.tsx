import { useWorkflowSession } from '../features/process-planning/useWorkflowSession'
import { ProcessPlanningPage } from '../pages/process-planning/ProcessPlanningPage'
import { lazy, Suspense } from 'react'
const ProgramReviewPage = lazy(() =>
  import('../pages/program-review/ProgramReviewPage').then((module) => ({
    default: module.ProgramReviewPage,
  })),
)
import { AgentBubble } from '../features/agent/AgentBubble'
import { AgentDrawer } from '../features/agent/AgentDrawer'
import { createDemoExchange } from '../features/agent/agentSession'
import type { WorkflowStage } from './WorkflowNavigation'

export function WorkflowWorkspace({
  stage,
  onNavigate,
  initialCaseReference,
}: {
  stage: WorkflowStage
  onNavigate: (stage: WorkflowStage) => void
  initialCaseReference?: { caseId: string; version: string }
}) {
  const workflow = useWorkflowSession(stage === 'planning', initialCaseReference)
  const { session, operation, selectOperation, updateSession, agentOpen, setAgentOpen } = workflow
  const programContext = `${session?.plan.caseReference?.caseId ?? '无参考案例'} / ${session?.plan.caseReference?.version ?? '—'} · 程序审核 · ${session?.program ? `${session.program.source === 'historical_reference' ? '历史参考' : session.program.source === 'demo_fixture' ? '不可执行测试文本' : 'CAM 来源'} · 修订 r${session.program.revision}` : '正文不可用'} · 本次未执行 CAM`
  return (
    <>
      <ProcessPlanningPage
        active={stage === 'planning'}
        workflow={workflow}
        onReview={() => onNavigate('review')}
      />
      {stage === 'review' && (
        <Suspense fallback={<p role="status">正在加载程序工作台…</p>}>
          <ProgramReviewPage workflow={workflow} onBack={() => onNavigate('planning')} />
        </Suspense>
      )}
      {stage !== 'input' && <AgentBubble onOpen={() => setAgentOpen(true)} />}
      <AgentDrawer
        open={stage !== 'input' && agentOpen}
        onClose={() => setAgentOpen(false)}
        plan={session?.plan ?? null}
        programContext={stage === 'review' ? programContext : undefined}
        operationId={session?.view === 'task' ? null : (operation?.id ?? null)}
        onOperation={selectOperation}
        messages={session?.messages ?? []}
        input={session?.input ?? ''}
        onInput={(input) => updateSession((current) => ({ ...current, input }))}
        onSend={() => {
          if (!session?.input.trim()) return
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
    </>
  )
}

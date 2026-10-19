const stages = [
  { id: 'input', number: '01', label: '模型输入', available: true },
  { id: 'planning', number: '02', label: '工艺决策', available: true },
  { id: 'review', number: '03', label: '程序审核', available: true },
] as const

export type WorkflowStage = (typeof stages)[number]['id']

type WorkflowNavigationProps = {
  currentStage: WorkflowStage
  onUnavailable: (message: string) => void
  onNavigate: (stage: WorkflowStage) => void
}

export function WorkflowNavigation({
  currentStage,
  onUnavailable,
  onNavigate,
}: WorkflowNavigationProps) {
  return (
    <nav className="workflow-navigation" aria-label="编程流程">
      {stages.map((stage) => (
        <button
          key={stage.id}
          className="button workflow-stage"
          type="button"
          aria-current={currentStage === stage.id ? 'step' : undefined}
          data-unavailable={!stage.available || undefined}
          title={!stage.available ? `${stage.label}页面尚未实现，暂不可用` : undefined}
          onClick={() => {
            // 当前阶段仅表示所在页面，不能推导业务已完成。
            if (!stage.available) onUnavailable(`${stage.label}页面尚未实现，暂不可用。`)
            else onNavigate(stage.id)
          }}
        >
          <span>{stage.number}</span> {stage.label}
        </button>
      ))}
    </nav>
  )
}

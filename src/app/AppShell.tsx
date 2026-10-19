import type { ReactNode } from 'react'
import { WorkflowNavigation } from './WorkflowNavigation'
import type { WorkflowStage } from './WorkflowNavigation'

type AppShellProps = {
  children: ReactNode
  fileBar: ReactNode
  currentStage: WorkflowStage
  onUnavailable: (message: string) => void
  onNavigate: (stage: 'input' | 'planning') => void
}

export function AppShell({
  children,
  fileBar,
  currentStage,
  onUnavailable,
  onNavigate,
}: AppShellProps) {
  return (
    <div className={`app-shell${currentStage === 'planning' ? ' planning-shell' : ''}`}>
      <header className="app-header">
        <h1>CNC Agentic Programming</h1>
        <div className="header-tools">
          <button
            className="button data-foundation-button"
            type="button"
            data-unavailable="true"
            title="数据底座页面尚未实现，暂不可用"
            onClick={() => onUnavailable('数据底座页面尚未实现，暂不可用。')}
          >
            数据底座
          </button>
          <span className="product-label">智能工艺决策</span>
          <span className="version-label">r06 / 原型演示</span>
        </div>
      </header>
      <WorkflowNavigation
        currentStage={currentStage}
        onUnavailable={onUnavailable}
        onNavigate={onNavigate}
      />
      {fileBar}
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        原型演示 · Agent / CAM 接口待接入；输入准备不代表 CAM 加工；人工确认不等于仿真或实机验证。
      </footer>
    </div>
  )
}

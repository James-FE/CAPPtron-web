import type { DemoTask } from '../api/view-model'
import { demoTasks } from '../mocks/tasks'

export function DataFoundationPage({ onBack }: { onBack: () => void }) {
  return (
    <section className="page-body foundation-page" aria-labelledby="foundation-heading">
      <div className="page-title-block">
        <h2 id="foundation-heading">数据底座</h2>
        <p>前端演示数据概况 · 尚未接入真实数据服务</p>
      </div>
      <div className="foundation-cards">
        <div>
          <strong>{demoTasks.length}</strong>
          <span>合成演示任务</span>
        </div>
        <div>
          <strong>
            {demoTasks.reduce((sum: number, task: DemoTask) => sum + task.operations.length, 0)}
          </strong>
          <span>演示工序总数</span>
        </div>
        <div>
          <strong>0</strong>
          <span>已验证真实 NC 产物</span>
        </div>
      </div>
      <p className="warning-text">
        所有统计只来自前端 Mock fixtures，不代表数据库、真实工艺能力或 CAM 验证结果。
      </p>
      <button className="button secondary" type="button" onClick={onBack}>
        返回工作台
      </button>
    </section>
  )
}

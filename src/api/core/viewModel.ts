import type { Plan, Task } from './client'
import type { ProcessPlan } from '../../features/process-planning/processPlan'
const names: Record<string, string> = {
  rough_step: '粗车步距',
  rpm: '主轴参数 rpm',
  feed: '进给参数 feed',
  clearance: '安全间隙',
  depth: '深度',
  retract: '退刀量',
  stock_x: 'X 向余量',
  stock_z: 'Z 向余量',
}
export function toProcessPlan(plan: Plan, task: Task, filename: string): ProcessPlan {
  const roughId = plan.payload.operations.find(
    (op) => op.attributes.parameters?.rough_step !== undefined,
  )?.id
  return {
    id: task.task_id,
    name: '当前模板工艺',
    partName: filename || '当前任务',
    origin: 'real',
    sourceDescription: `Core · 工艺修订 ${task.current_revision}`,
    operations: plan.payload.operations.map((op, index) => ({
      id: op.id,
      sequence: index + 1,
      name: op.name ?? op.id,
      source: `服务端工艺修订 ${task.current_revision}`,
      setup: op.attributes.setup_id,
      steps: (op.steps ?? []).map((step) => ({
        id: step.id,
        sequence: step.sequence,
        name: step.content,
        parameters: [],
      })),
      parameters: Object.entries(op.attributes.parameters ?? {}).map(([id, value]) => ({
        id,
        name: names[id] ?? id,
        value,
        unit: ['rough_step', 'stock_x', 'stock_z', 'clearance', 'depth', 'retract'].includes(id)
          ? 'mm'
          : undefined,
        source: 'upstream',
        status: 'provided',
        editable: op.id === roughId && id === 'rough_step',
        inputKind: 'number',
        description: '当前执行计划原始值；修改需提交并重新批准。',
      })),
      resources: op.attributes.tool
        ? [
            {
              id: `${op.id}-tool`,
              name: `刀具 ${op.attributes.tool.tool_number ?? '未提供'}`,
              kind: 'tool',
              description: `刀位 ${op.attributes.tool.station ?? '未提供'}`,
              status: 'pending',
            },
          ]
        : [],
      onsiteMeasurements: [],
      notes: '现场补充信息暂未接入；不影响当前固定模板联调。',
    })),
  }
}

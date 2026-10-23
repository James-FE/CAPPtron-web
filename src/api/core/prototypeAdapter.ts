import type { ProcessPlan } from '../../features/process-planning/processPlan'
import type { LiveProcessPlan } from './viewModel'

/** 复用原工艺组件；离散修订控件独立提交，不把通用文本草稿视为批准值。 */
export function toPrototypePlan(live: LiveProcessPlan, locked = false): ProcessPlan {
  return {
    ...live,
    sourceDescription: 'Core 服务端计划 · 人工制造审核待完成',
    operations: live.operations.map((operation) => ({
      ...operation,
      source: 'Core 服务端',
      onsiteMeasurements: [],
      steps: operation.steps.map((step) => ({ ...step, parameters: [] })),
      parameters: operation.parameters.map((parameter) => ({
        ...parameter,
        value: typeof parameter.value === 'boolean' ? String(parameter.value) : parameter.value,
        source: parameter.source,
        editable: parameter.editable && !locked,
        status: parameter.value === null ? 'missing' : 'provided',
        inputKind: 'text',
      })),
      resources: operation.resources.map((resource) => ({
        ...resource,
        kind: ['tool', 'machine'].includes(resource.kind)
          ? (resource.kind as 'tool' | 'machine')
          : 'other',
        status: resource.status,
        description: `来源：${resource.source}`,
      })),
    })),
  }
}

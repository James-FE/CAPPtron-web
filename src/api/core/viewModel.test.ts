import { describe, expect, it } from 'vitest'
import { toProcessPlan } from './viewModel'
import type { Plan } from './client'
describe('真实计划到原型展示', () => {
  it('保留稳定身份与实际参数，只允许首个粗车步距修订，不补入示例', () => {
    const plan = {
      payload: {
        operations: [
          {
            id: 'outer',
            name: '外圆',
            steps: [{ id: 's', sequence: 1, content: '实际工步' }],
            attributes: { parameters: { rough_step: 0.4, rpm: 295 }, tool: { tool_number: 9 } },
          },
          { id: 'inner', attributes: { parameters: { rough_step: 0.5 } } },
        ],
        extensions: {
          template: { digest: 'd' },
          plan_digest: 'p',
          reference_only: true,
          execution_ready: false,
        },
      },
    } as Plan
    const vm = toProcessPlan(
      plan,
      { task_id: 't', current_revision: 2, feedback_version: 0 },
      'part.stp',
    )
    expect(vm.origin).toBe('real')
    expect(vm.operations[0]!.steps[0]!.id).toBe('s')
    expect(vm.operations[0]!.parameters.find((p) => p.id === 'rough_step')?.editable).toBe(true)
    expect(vm.operations[1]!.parameters[0]!.editable).toBe(false)
    expect(vm.operations[1]!.steps).toEqual([])
    expect(vm.operations[0]!.resources[0]!.name).toBe('刀具 9')
  })
})

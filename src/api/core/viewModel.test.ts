import { describe, expect, it } from 'vitest'
import fixture from '../../../e2e/fixtures/core-golden.json'
import type { Deployment, LivePlan } from './contracts'
import { parameterChanges, toProcessPlan } from './viewModel'
import { goldenRequest, validateDeployment } from './golden'
import { cardPath } from './client'
import { draftKey } from '../../features/process-planning/processPlan'

const config = fixture.deployment as Deployment
const plan = () => structuredClone(fixture.plan) as unknown as LivePlan
describe('固定Golden结果映射与版本约束', () => {
  it('按实际sequence排序、保留插入钻孔的ID，不填补资源和参数', () => {
    const input = plan()
    input.payload.operations.reverse()
    const vm = toProcessPlan(input, config)
    expect(vm.operations).toHaveLength(7)
    expect(vm.operations[1]?.id).toBe('ring-op-7')
    expect(vm.operations[0]?.resources).toEqual([])
    expect(vm.operations[0]?.parameters).toEqual([])
    expect(vm.operations[0]?.steps[0]?.id).toBe(
      input.payload.operations.find((op) => op.id === vm.operations[0]?.id)?.steps[0]?.id,
    )
  })
  it('只接受离散值，禁止0.45及未知来源编辑', () => {
    const input = plan(),
      vm = toProcessPlan(input, config)
    const key = draftKey('ring-op-2', 'parameters', 'rough_step')
    expect(parameterChanges(vm, { [key]: '0.4' })).toEqual([
      { operation_id: 'ring-op-2', parameter_id: 'rough_step', value: 0.4, unit: 'mm' },
    ])
    expect(() => parameterChanges(vm, { [key]: '0.45' })).toThrow('仅允许')
    const rough = input.payload.operations.find((op) => op.id === 'ring-op-2')!
    delete rough.attributes.parameter_metadata
    rough.attributes.parameters!.unlabelled_speed = 123
    const result = toProcessPlan(input, config).operations.find((op) => op.id === rough.id)!
    expect(result.parameters.every((p) => !p.editable)).toBe(true)
    expect(result.parameters.find((p) => p.id === 'unlabelled_speed')?.unit).toBeUndefined()
  })
  it('摘要/输出协议错误拒绝，重复身份不使用下标修复', () => {
    const input = plan()
    input.payload.operations[1]!.id = input.payload.operations[0]!.id
    expect(() => toProcessPlan(input, config)).toThrow('身份')
    expect(() => toProcessPlan({ ...plan(), provider: 'mock' }, config)).toThrow('协议')
    expect(() =>
      toProcessPlan(plan(), {
        ...config,
        template: { ...config.template, digest: 'f'.repeat(64) },
      }),
    ).toThrow('身份')
  })
  it('创建不伪造几何，缺binding及解析身份不匹配阻断', () => {
    expect(() => validateDeployment({ ...config, engineering_binding_configured: false })).toThrow(
      'EngineeringBinding',
    )
    const parsed = { ...fixture.parse, status: 'parsed' as const, execution_ready: false as const }
    const body = goldenRequest(config, fixture.asset, parsed, 'create-command')
    expect(body.payload).not.toHaveProperty('part')
    expect(() =>
      goldenRequest(config, fixture.asset, { ...parsed, source_sha256: '0'.repeat(64) }, 'c'),
    ).toThrow('不匹配')
  })
  it('工艺卡task_key使用UTF8 base64url，与planning路径分离', () => {
    const key = cardPath('task/中文', 2)
    expect(key).toBe('/process-cards/tasks/id_dGFzay_kuK3mloc/results/2')
    expect(key).not.toContain('=')
  })
})

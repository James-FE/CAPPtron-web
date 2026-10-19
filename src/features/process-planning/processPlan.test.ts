import { readFileSync } from 'node:fs'
import { validateCaseDocument } from '../../api/case-catalog/validation'
import { caseToProcessPlan } from '../../api/case-catalog/adapter'
import { describe, expect, it } from 'vitest'
import { demoPlanOptions, loadDemoPlan } from '../../api/mock/processPlans'
import { resolveOperation, validateDraft } from './processPlan'

describe('演示方案与前端展示契约', () => {
  it('支持不同规模、缺失字段和零工序，不推断本地模型结果', () => {
    expect(loadDemoPlan('simple').operations).toHaveLength(3)
    expect(loadDemoPlan('complex').operations).toHaveLength(20)
    const incomplete = loadDemoPlan('incomplete').operations[0]!
    expect(incomplete.steps).toEqual([])
    expect(incomplete.resources).toEqual([])
    expect(incomplete.parameters[0]?.value).toBeNull()
    expect(resolveOperation(loadDemoPlan('empty'), null)).toBeNull()
    for (const option of demoPlanOptions) {
      const plan = loadDemoPlan(option.id)
      expect(plan.origin).toBe('mock')
      expect(plan.sourceDescription).toContain('未关联本地 STEP 文件')
      expect(new Set(plan.operations.map((item) => item.id)).size).toBe(plan.operations.length)
      for (const operation of plan.operations) {
        expect(new Set(operation.steps.map((item) => item.id)).size).toBe(operation.steps.length)
      }
    }
  })

  it('重排保留选中身份；删除后回退合法工序', () => {
    const plan = loadDemoPlan('simple')
    const selected = plan.operations[1]!
    plan.operations.reverse()
    expect(resolveOperation(plan, selected.id)).toBe(selected)
    plan.operations = plan.operations.filter((item) => item.id !== selected.id)
    expect(resolveOperation(plan, selected.id)).toBe(plan.operations[0])
    plan.operations = []
    expect(resolveOperation(plan, selected.id)).toBeNull()
  })

  it('演示加载彼此独立，不把本地编辑写入源数据', () => {
    const first = loadDemoPlan('simple')
    first.operations[0]!.onsiteMeasurements[0]!.value = 999
    expect(loadDemoPlan('simple').operations[0]!.onsiteMeasurements[0]!.value).toBeNull()
  })

  it('环件按 Golden-B7 六工序展示，共用现场信息不挂在外圆精车上', () => {
    const plan = caseToProcessPlan(
      validateCaseDocument(
        JSON.parse(readFileSync('public/case-catalog/golden-b7/v2.json', 'utf8')),
      ),
    )
    expect(plan.operations.map((item) => item.name)).toEqual([
      '端面车削',
      '外圆粗车',
      '外圆精车',
      '内孔粗车',
      '内孔精车',
      '切断',
    ])
    expect(JSON.stringify(plan)).not.toMatch(/球面|热处理|内止口|M-002/)
    expect(plan.taskMeasurements).toHaveLength(5)
    expect(
      plan.operations.find((item) => item.id === 'ring-finish-od')?.onsiteMeasurements,
    ).toEqual([])
    expect(
      plan.operations.find((item) => item.id === 'ring-finish-id')?.onsiteMeasurements,
    ).toHaveLength(1)
    expect(plan.operations[0]!.parameters[0]).toMatchObject({
      name: '恒线速 G96',
      value: 295,
      unit: 'm/min',
      source: 'historical_record',
    })
  })

  it('草稿只验证可编辑性和输入格式，不表示制造校核通过', () => {
    const operation = loadDemoPlan('simple').operations[0]!
    const field = operation.onsiteMeasurements[0]!
    expect(validateDraft(field, '')).toContain('待补充')
    expect(validateDraft(field, 'NaN')).toContain('有限数值')
    expect(validateDraft(field, 'Infinity')).toContain('有限数值')
    expect(validateDraft(field, '12.5')).toBeNull()
    expect(validateDraft(operation.parameters[0]!, '12')).toContain('不允许')
    expect(field.value).toBeNull()
  })
})

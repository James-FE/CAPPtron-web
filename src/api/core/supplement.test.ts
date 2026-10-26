import { expect, it } from 'vitest'
import {
  attachSupplementFields,
  supplementFields,
  supplementValues,
  applySupplement,
  supplementSchema,
} from './supplement'
import type { ProcessPlan } from '../../features/process-planning/processPlan'
const model = () => {
  const plan = {
    id: 'task-1',
    operations: [{ id: 'ring-op-5', onsiteMeasurements: [] }],
  } as unknown as ProcessPlan
  attachSupplementFields(plan, 'golden-b7')
  return plan
}
it('Golden字段缺失、非法数值不能提交；服务端记录回读不改CAM参数', () => {
  const plan = model()
  expect(supplementFields(plan)).toHaveLength(6)
  expect(() => supplementValues(plan, {})).toThrow()
  const values = Object.fromEntries(
    supplementFields(plan).map(({ key, p }) => [
      key,
      p.id === 'stock-od'
        ? '43'
        : p.id === 'stock-id'
          ? '38'
          : p.id === 'stock-length'
            ? '100'
            : p.inputKind === 'number'
              ? '1.6'
              : '人工记录',
    ]),
  )
  plan.verifiedGeometry = { outer_diameter_mm: 41, inner_diameter_mm: 39, thickness_mm: 5 }
  expect(supplementValues(plan, values)).toEqual(values)
  expect(() =>
    supplementValues(plan, { ...values, [supplementFields(plan)[1]!.key]: '100' }),
  ).toThrow()
  expect(() =>
    supplementValues(plan, { ...values, [supplementFields(plan)[0]!.key]: '-1' }),
  ).toThrow()
  applySupplement(plan, {
    feedback_version: 1,
    items: [
      {
        feedback_id: 'f1',
        status: 'active',
        expected_feedback_version: 0,
        supplement_schema_version: supplementSchema,
        supplement: { values },
      },
    ],
  })
  expect(plan.taskMeasurements?.[0]?.source).toBe('human')
  expect(plan.operations[0]?.onsiteMeasurements[0]?.value).toBe('1.6')
})
it('服务端模板默认值预填但仍保留未知Ra和来源', () => {
  const plan = model()
  attachSupplementFields(plan, 'golden-b7', {
    schema_version: 'template-onsite-input-v2',
    task_fields: [
      {
        id: 'stock-od',
        name: '毛坯外径',
        value: 150,
        unit: 'mm',
        inputKind: 'number',
        description: '模板回读',
      },
    ],
    operation_fields: {
      'ring-op-5': [
        { id: 'bore-surface-ra', name: 'Ra', value: null, unit: 'μm', inputKind: 'number' },
      ],
    },
  })
  expect(plan.taskMeasurements?.[0]?.value).toBe(150)
  expect(plan.taskMeasurements?.[0]?.source).toBe('upstream')
  expect(plan.operations[0]?.onsiteMeasurements[0]?.value).toBeNull()
})

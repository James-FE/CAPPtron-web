import { describe, expect, it } from 'vitest'
import schema from '../schema/foundation-dataset.schema.json'
import { FoundationError } from '../reader'
import {
  assetKinds,
  integrationStatuses,
  knowledgeCategories,
  knowledgeTopics,
  machineTypes,
  manufacturingTypes,
  modelTypes,
  operationMethods,
  partCategories,
  supportedTasks,
  toolTypes,
  type FoundationDataset,
} from '../types'
import { validateFoundationDataset } from '../validation'
import { emptyDataset, smallDataset } from './fixtures'

function expectIssue(value: unknown, code: string, path: string) {
  try {
    validateFoundationDataset(value)
    expect.fail('应拒绝非法数据')
  } catch (error) {
    expect(error).toBeInstanceOf(FoundationError)
    const failure = error as FoundationError
    expect(failure.code).toBe(code)
    expect(failure.issues.some((issue) => issue.path.includes(path))).toBe(true)
  }
}
describe('结构与关系验证', () => {
  it('接受独立事实集、空集、缺失资源和零工序', () => {
    expect(validateFoundationDataset(emptyDataset())).toEqual(emptyDataset())
    const data = smallDataset()
    delete data.processPlans[0]!.operations[0]!.machineId
    data.processPlans[0]!.operations[0]!.toolIds = []
    data.machines[0]!.capabilities = {}
    expect(validateFoundationDataset(data)).toEqual(data)
    data.processPlans[0]!.operations = []
    expect(validateFoundationDataset(data)).toEqual(data)
  })
  it('Schema 与 TypeScript 的所有领域枚举一致', () => {
    const pairs = [
      [schema.definitions.assetKind.enum, assetKinds],
      [schema.definitions.partCategory.enum, partCategories],
      [schema.definitions.operationMethod.enum, operationMethods],
      [schema.definitions.manufacturingType.enum, manufacturingTypes],
      [schema.definitions.machineType.enum, machineTypes],
      [schema.definitions.toolType.enum, toolTypes],
      [schema.definitions.knowledgeCategory.enum, knowledgeCategories],
      [schema.definitions.knowledgeTopic.enum, knowledgeTopics],
      [schema.definitions.modelType.enum, modelTypes],
      [schema.definitions.integrationStatus.enum, integrationStatuses],
      [schema.definitions.supportedTask.enum, supportedTasks],
    ]
    for (const [actual, expected] of pairs) expect(actual).toEqual(expected)
  })
  it('未知版本独立报错，不把结构缺失误标成版本冲突', () => {
    expectIssue(
      { ...emptyDataset(), schemaVersion: '2.0' },
      'contract_incompatible',
      'schemaVersion',
    )
    expectIssue({ ...emptyDataset(), schemaVersion: null }, 'invalid_data', 'schemaVersion')
    expectIssue({}, 'invalid_data', 'schemaVersion')
  })
  it.each([
    ['时间缺少时区', 'createdAt', '2026-10-20T12:00:00'],
    ['不存在的闰日', 'createdAt', '2026-02-29T00:00:00Z'],
    ['未知偏移', 'createdAt', '2026-10-20T00:00:00-00:00'],
    ['非法小时', 'createdAt', '2026-10-20T24:00:00Z'],
    ['空名称', 'name', ' '],
    ['未知类别', 'category', 'alien'],
    ['null', 'description', null],
    ['额外字段', 'extra', 'value'],
    ['undefined', 'description', undefined],
  ])('拒绝 %s 并返回字段路径', (_label, field, replacement) => {
    const data = smallDataset()
    Object.assign(data.parts[0]!, { [field]: replacement })
    expectIssue(data, 'invalid_data', field)
  })
  it.each([NaN, Infinity, -Infinity, -1, '4000', null])('拒绝非法数值 %s', (replacement) => {
    const data = smallDataset()
    Object.assign(data.machines[0]!.capabilities.maxSpindleSpeed!, { value: replacement })
    expectIssue(data, 'invalid_data', 'value')
  })
  it('拒绝错误单位、可选字段 null、错误时区和不可序列化对象', () => {
    const data = smallDataset()
    Object.assign(data.machines[0]!.capabilities.maxSpindleSpeed!, { unit: 'rpm' })
    expectIssue(data, 'invalid_data', 'unit')
    expectIssue({ ...emptyDataset(), timeZone: 'Not/AZone' }, 'invalid_data', 'timeZone')
    const optional = smallDataset()
    Object.assign(optional.machines[0]!, { manufacturer: null })
    expectIssue(optional, 'invalid_data', 'manufacturer')
    expectIssue({ ...emptyDataset(), asOf: new Date() }, 'invalid_data', 'asOf')
  })
  it.each<[string, (data: FoundationDataset) => void, string]>([
    ['资源重复', (d) => d.parts.push(d.parts[0]!), 'part/part-a'],
    [
      '工序重复',
      (d) => d.processPlans[0]!.operations.push(d.processPlans[0]!.operations[0]!),
      'operations/op-facing/id',
    ],
    [
      '序号重复',
      (d) =>
        d.processPlans[0]!.operations.push({ ...d.processPlans[0]!.operations[0]!, id: 'other' }),
      'sequence',
    ],
    [
      '零件悬空',
      (d) => {
        d.processPlans[0]!.partId = 'missing'
      },
      'partId',
    ],
    [
      '机床悬空',
      (d) => {
        d.processPlans[0]!.operations[0]!.machineId = 'missing'
      },
      'machineId',
    ],
    [
      '刀具悬空',
      (d) => {
        d.processPlans[0]!.operations[0]!.toolIds = ['missing']
      },
      'toolIds',
    ],
    [
      '知识悬空',
      (d) => {
        d.processPlans[0]!.operations[0]!.knowledgeIds = ['missing']
      },
      'knowledgeIds',
    ],
    [
      '知识资源悬空',
      (d) => {
        d.knowledge[0]!.relatedAssets = [{ kind: 'tool', id: 'missing' }]
      },
      'relatedAssets',
    ],
    [
      '事件目标悬空',
      (d) => {
        Object.assign(d.usageEvents[0]!, { knowledgeId: 'missing' })
      },
      'knowledgeId',
    ],
    [
      '模型目标悬空',
      (d) => {
        Object.assign(d.usageEvents[6]!, { modelId: 'missing' })
      },
      'modelId',
    ],
    ['事件重复', (d) => d.usageEvents.push(d.usageEvents[0]!), 'usageEvents/ref-a1/id'],
    [
      '机床方式冲突',
      (d) => {
        d.machines[0]!.supportedOperations = ['milling']
      },
      'supportedOperations',
    ],
    [
      '工序机床冲突',
      (d) => {
        d.machines[0]!.supportedOperations = []
      },
      'machineId',
    ],
    [
      '刀具分类冲突',
      (d) => {
        d.tools[0]!.toolType = 'end_mill'
      },
      'supportedOperations',
    ],
    [
      '刀具适配冲突',
      (d) => {
        d.tools[0]!.compatibleMachineTypes = []
      },
      'toolIds',
    ],
    [
      '方案分类冲突',
      (d) => {
        d.processPlans[0]!.manufacturingType = 'drilling'
      },
      'method',
    ],
    [
      '知识条件冲突',
      (d) => {
        d.knowledge[0]!.applicability.materials = ['6061铝合金']
      },
      'knowledgeIds',
    ],
    [
      '模型任务冲突',
      (d) => {
        Object.assign(d.usageEvents[6]!, { task: 'feature_recognition' })
      },
      'task',
    ],
    [
      '未来登记',
      (d) => {
        d.parts[0]!.createdAt = '2026-10-21T00:00:00Z'
      },
      'createdAt',
    ],
    [
      '方案早于零件',
      (d) => {
        d.processPlans[0]!.createdAt = '2026-10-01T00:00:00Z'
      },
      'createdAt',
    ],
    [
      '事件早于目标',
      (d) => {
        d.usageEvents[0]!.occurredAt = '2026-01-01T00:00:00Z'
      },
      'occurredAt',
    ],
    [
      '未来事件',
      (d) => {
        d.usageEvents[0]!.occurredAt = '2026-12-01T00:00:00Z'
      },
      'occurredAt',
    ],
    [
      '资源混合来源',
      (d) => {
        d.knowledge[0]!.provenance.dataMode = 'live'
      },
      'provenance',
    ],
    [
      '事件混合来源',
      (d) => {
        d.usageEvents[0]!.provenance.dataMode = 'live'
      },
      'provenance',
    ],
    [
      '模拟模型冒充部署',
      (d) => {
        d.models[0]!.integrationStatus = 'available'
      },
      'integrationStatus',
    ],
  ])('定位 %s', (_label, mutate, path) => {
    const data = smallDataset()
    mutate(data)
    expectIssue(data, 'data_integrity', path)
  })
  it('主分类只能为单值；重复引用不能增加计数', () => {
    const data = smallDataset()
    Object.assign(data.knowledge[0]!, { knowledgeCategory: ['industry', 'experience'] })
    expectIssue(data, 'invalid_data', 'knowledgeCategory')
    const duplicate = smallDataset()
    duplicate.processPlans[0]!.operations[0]!.toolIds.push('tool-a')
    expectIssue(duplicate, 'invalid_data', 'toolIds')
  })
  it('契约可以识别 live 来源，但不将分类作为真实性证据', () => {
    const data = smallDataset()
    data.dataMode = 'live'
    for (const group of [
      data.parts,
      data.processPlans,
      data.machines,
      data.tools,
      data.knowledge,
      data.models,
      data.usageEvents,
    ])
      for (const item of group) item.provenance = { dataMode: 'live', source: 'contract-test-only' }
    data.models[0]!.integrationStatus = 'available'
    expect(validateFoundationDataset(data).dataMode).toBe('live')
    expect(smallDataset().knowledge[1]!.provenance.dataMode).toBe('synthetic_demo')
  })
})

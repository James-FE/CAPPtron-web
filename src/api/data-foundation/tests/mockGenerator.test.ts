import { describe, expect, it, vi } from 'vitest'
import { assetDetails } from '../assets'
import { generateFoundationMock } from '../mock/generateFoundationMock'
import { foundationDemoConfig } from '../mock/mockConfig'
import { calculateOverview } from '../statistics'
import { businessDate } from '../time'
import { validateFoundationDataset } from '../validation'

describe('可复现 Mock 生成', () => {
  it('默认规模、完整来源、JSON 往返和关系有效', () => {
    const data = generateFoundationMock(foundationDemoConfig)
    expect([
      data.parts.length,
      data.processPlans.length,
      data.machines.length,
      data.tools.length,
      data.knowledge.length,
      data.models.length,
      data.usageEvents.length,
    ]).toEqual([24, 32, 3, 40, 72, 6, 240])
    expect(data.schemaVersion).toBe('1.0')
    expect(data.datasetVersion).toBe('foundation-turning-mock-v2:20261020:2026-10-20')
    expect(validateFoundationDataset(JSON.parse(JSON.stringify(data)))).toEqual(data)
    const assets = assetDetails(data)
    expect(new Set(assets.map((item) => `${item.kind}/${item.asset.id}`)).size).toBe(177)
    expect(
      [...assets.map((item) => item.asset), ...data.usageEvents].every(
        (item) =>
          item.provenance.dataMode === 'synthetic_demo' &&
          item.provenance.source === 'foundation-turning-mock-v2',
      ),
    ).toBe(true)
    expect(data.models.every((model) => model.integrationStatus === 'not_connected')).toBe(true)
    expect(calculateOverview(data)).toMatchObject({ totalAssets: 171, businessDataCount: 99 })
    expect(data.usageEvents.filter((event) => event.type === 'knowledge_referenced')).toHaveLength(
      180,
    )
    expect(data.usageEvents.filter((event) => event.type === 'model_invoked')).toHaveLength(60)
  })
  it('相同输入逐字段一致，隔离调用顺序和外部随机数/时钟', () => {
    const expected = generateFoundationMock(foundationDemoConfig)
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('禁止全局随机数')
    })
    const now = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('禁止系统时钟')
    })
    try {
      generateFoundationMock({ seed: 50, asOfDate: '2030-01-01' })
      expect(generateFoundationMock(foundationDemoConfig)).toEqual(expected)
    } finally {
      random.mockRestore()
      now.mockRestore()
    }
  })
  it.each([0, 1, 2, 50, 123456, 0xffffffff])('seed %s 生成不同但有效的数据', (seed) => {
    const data = generateFoundationMock({ ...foundationDemoConfig, seed })
    expect(validateFoundationDataset(data)).toBe(data)
    expect(data).not.toEqual(generateFoundationMock(foundationDemoConfig))
  })
  it.each([20261020, 0, 1, 50, 0xffffffff])('seed %s 的完整资源目录只覆盖车削场景', (seed) => {
    const data = generateFoundationMock({ ...foundationDemoConfig, seed })
    const allowedMethods = ['turning', 'drilling', 'boring', 'parting']
    expect(new Set(data.parts.map((part) => part.category))).toEqual(
      new Set(['shaft', 'ring', 'disc']),
    )
    for (const part of data.parts) {
      expect(part.features).toContain('外圆')
      expect(part.description).toContain('回转体车削阶段')
    }
    expect(JSON.stringify(data)).not.toMatch(/铣|孔阵列|型腔|安装面|分度盘|离合盘/)
    for (const machine of data.machines) {
      expect(machine.machineType).toBe('cnc_lathe')
      expect(machine.capabilities.axisCount).toBe(2)
      expect(machine.supportedOperations.every((method) => allowedMethods.includes(method))).toBe(
        true,
      )
    }
    expect(new Set(data.tools.map((tool) => tool.toolType))).toEqual(
      new Set(['external_turning', 'internal_turning', 'parting', 'drill', 'boring_bar']),
    )
    for (const tool of data.tools) {
      expect(tool.compatibleMachineTypes).toEqual(['cnc_lathe'])
      expect(tool.supportedOperations.every((method) => allowedMethods.includes(method))).toBe(true)
    }
    for (const plan of data.processPlans) {
      expect(plan.manufacturingType).toBe('turning')
      expect(plan.operations.some((operation) => operation.method === 'turning')).toBe(true)
      for (const operation of plan.operations) {
        expect(allowedMethods).toContain(operation.method)
        const expectedToolTypes = {
          turning: ['external_turning'],
          drilling: ['drill'],
          boring: ['internal_turning', 'boring_bar'],
          parting: ['parting'],
          milling: [],
        }
        for (const toolId of operation.toolIds) {
          expect(expectedToolTypes[operation.method]).toContain(
            data.tools.find((tool) => tool.id === toolId)?.toolType,
          )
        }
        if (operation.machineId) {
          expect(
            data.machines.find((machine) => machine.id === operation.machineId)?.machineType,
          ).toBe('cnc_lathe')
        }
      }
    }
    for (const knowledge of data.knowledge) {
      expect(knowledge.title).toContain('车削')
      expect(knowledge.content).toContain('车削合成知识示例')
      expect(
        knowledge.applicability.operations.every((method) => allowedMethods.includes(method)),
      ).toBe(true)
      expect(knowledge.applicability.partCategories).toHaveLength(1)
      expect(['shaft', 'ring', 'disc']).toContain(knowledge.applicability.partCategories[0])
    }
    expect(validateFoundationDataset(data)).toBe(data)
  })
  it('seed 只改变候选选择、时间和身份，不随机发明零件特征或工序结构', () => {
    const template = (seed: number) => {
      const data = generateFoundationMock({ ...foundationDemoConfig, seed })
      return {
        parts: data.parts.map(({ name, category, features }) => ({ name, category, features })),
        plans: data.processPlans.map(({ name, manufacturingType, operations }) => ({
          name,
          manufacturingType,
          operations: operations.map(({ sequence, name, method }) => ({ sequence, name, method })),
        })),
        knowledge: data.knowledge.map(({ title, content, applicability }) => ({
          title,
          content,
          applicability,
        })),
      }
    }
    expect(template(1)).toEqual(template(20261020))
  })
  it('覆盖车床工序、共享关系、1:N 和合法缺失', () => {
    const data = generateFoundationMock(foundationDemoConfig)
    const operations = data.processPlans.flatMap((plan) => plan.operations)
    expect(new Set(operations.map((operation) => operation.method))).toEqual(
      new Set(['turning', 'drilling', 'boring', 'parting']),
    )
    expect(operations).toHaveLength(96)
    expect(new Set(data.processPlans.map((plan) => plan.partId)).size).toBe(data.parts.length)
    expect(data.processPlans.length).toBeGreaterThan(data.parts.length)
    const machineIds = operations.flatMap((operation) =>
      operation.machineId ? [operation.machineId] : [],
    )
    expect(new Set(machineIds).size).toBeLessThan(machineIds.length)
    expect(operations.some((operation) => !operation.machineId && !operation.toolIds.length)).toBe(
      true,
    )
    expect(
      data.knowledge.some((item) => item.relatedAssets.some((ref) => ref.kind === 'process_plan')),
    ).toBe(true)
  })
  it('日期跨多天分布、更新基准日不改变资源身份且相对趋势一致', () => {
    const data = generateFoundationMock(foundationDemoConfig)
    const future = generateFoundationMock({ ...foundationDemoConfig, asOfDate: '2027-02-20' })
    expect(
      new Set(assetDetails(data).map((item) => businessDate(item.asset.createdAt, data.timeZone)))
        .size,
    ).toBeGreaterThan(14)
    expect(assetDetails(future).map((item) => item.asset.id)).toEqual(
      assetDetails(data).map((item) => item.asset.id),
    )
    expect(calculateOverview(future)).toEqual({ ...calculateOverview(data), date: '2027-02-20' })
  })
  it.each([
    { seed: NaN, asOfDate: '2026-10-20' },
    { seed: -1, asOfDate: '2026-10-20' },
    { seed: 1.5, asOfDate: '2026-10-20' },
    { seed: 0x100000000, asOfDate: '2026-10-20' },
    { seed: 1, asOfDate: '2026-02-29' },
    { seed: 1, asOfDate: '1900-01-01' },
  ])('拒绝非法生成配置 $seed/$asOfDate', (config) => {
    expect(() => generateFoundationMock(config)).toThrow(
      expect.objectContaining({ code: 'invalid_query' }),
    )
  })
})

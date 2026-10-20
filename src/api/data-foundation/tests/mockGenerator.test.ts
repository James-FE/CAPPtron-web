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
    ]).toEqual([24, 32, 12, 48, 120, 6, 240])
    expect(validateFoundationDataset(JSON.parse(JSON.stringify(data)))).toEqual(data)
    const assets = assetDetails(data)
    expect(new Set(assets.map((item) => `${item.kind}/${item.asset.id}`)).size).toBe(242)
    expect(
      [...assets.map((item) => item.asset), ...data.usageEvents].every(
        (item) => item.provenance.dataMode === 'synthetic_demo',
      ),
    ).toBe(true)
    expect(data.models.every((model) => model.integrationStatus === 'not_connected')).toBe(true)
    expect(calculateOverview(data).totalAssets).toBe(236)
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
  it('覆盖制造场景、共享关系、1:N 和合法缺失', () => {
    const data = generateFoundationMock(foundationDemoConfig)
    const operations = data.processPlans.flatMap((plan) => plan.operations)
    expect(new Set(operations.map((operation) => operation.method))).toEqual(
      new Set(['turning', 'milling', 'drilling', 'boring', 'parting']),
    )
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

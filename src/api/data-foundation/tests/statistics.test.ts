import { describe, expect, it } from 'vitest'
import { generateFoundationMock } from '../mock/generateFoundationMock'
import { foundationDemoConfig } from '../mock/mockConfig'
import {
  calculateGrowthTrend,
  calculateHotAssets,
  calculateKnowledgeDistribution,
  calculateOverview,
  calculateResourceSummary,
} from '../statistics'
import { businessDate } from '../time'
import { emptyDataset, smallDataset } from './fixtures'

describe('统计口径', () => {
  it('六个指标来自记录；工序、模型和事件不重复计入资产总量', () => {
    expect(calculateOverview(smallDataset())).toEqual({
      date: '2026-10-20',
      totalAssets: 8,
      addedToday: 4,
      knowledgeCount: 3,
      businessDataCount: 5,
      modelCount: 1,
      modelInvocationsToday: 2,
    })
    const data = smallDataset()
    data.processPlans[0]!.operations.push({
      id: 'another-operation',
      name: '其他工序',
      method: 'turning',
      sequence: 20,
      toolIds: [],
      knowledgeIds: [],
    })
    data.models.push({ ...data.models[0]!, id: 'model-b', createdAt: '2026-10-20T00:00:00Z' })
    expect(calculateOverview(data)).toMatchObject({ totalAssets: 8, addedToday: 4, modelCount: 2 })
  })
  it('七天窗口含当天、连续补零且严格对应登记记录', () => {
    expect(calculateGrowthTrend(smallDataset(), { days: 7 })).toEqual({
      startDate: '2026-10-14',
      endDate: '2026-10-20',
      points: [
        { date: '2026-10-14', knowledgeAdded: 0, businessDataAdded: 0 },
        { date: '2026-10-15', knowledgeAdded: 0, businessDataAdded: 0 },
        { date: '2026-10-16', knowledgeAdded: 0, businessDataAdded: 0 },
        { date: '2026-10-17', knowledgeAdded: 0, businessDataAdded: 0 },
        { date: '2026-10-18', knowledgeAdded: 0, businessDataAdded: 1 },
        { date: '2026-10-19', knowledgeAdded: 1, businessDataAdded: 1 },
        { date: '2026-10-20', knowledgeAdded: 2, businessDataAdded: 2 },
      ],
    })
    expect(calculateGrowthTrend(smallDataset(), { endDate: '2026-10-18', days: 1 }).points).toEqual(
      [{ date: '2026-10-18', knowledgeAdded: 0, businessDataAdded: 1 }],
    )
  })
  it('上海午夜前后与 UTC 日界明确，时间戳偏移按同一瞬间处理', () => {
    const data = smallDataset()
    expect(calculateOverview(data, { timeZone: 'UTC' })).toMatchObject({
      addedToday: 2,
      modelInvocationsToday: 1,
    })
    expect(calculateOverview(data, { date: '2026-10-19' })).toMatchObject({
      addedToday: 2,
      modelInvocationsToday: 1,
      totalAssets: 8,
    })
    const before = calculateGrowthTrend(data, {})
    data.knowledge[1]!.createdAt = '2026-10-20T00:00:00+08:00'
    expect(calculateGrowthTrend(data, {})).toEqual(before)
  })
  it.each([
    {
      date: '2026-03-08',
      before: '2026-03-08T04:59:59.999Z',
      start: '2026-03-08T05:00:00Z',
      middle: ['2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z'],
      end: '2026-03-09T03:59:59.999Z',
      after: '2026-03-09T04:00:00Z',
    },
    {
      date: '2026-11-01',
      before: '2026-11-01T03:59:59.999Z',
      start: '2026-11-01T04:00:00Z',
      middle: ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z'],
      end: '2026-11-02T04:59:59.999Z',
      after: '2026-11-02T05:00:00Z',
    },
  ])('夏令时 $date 的 23/25 小时自然日不按固定 24h 截断', (window) => {
    const data = emptyDataset()
    data.asOf = window.after
    data.parts = [window.before, window.start, ...window.middle, window.end, window.after].map(
      (createdAt, index) => ({
        ...smallDataset().parts[0]!,
        id: `boundary-${index}`,
        createdAt,
      }),
    )
    expect(
      calculateGrowthTrend(data, { days: 1, endDate: window.date, timeZone: 'America/New_York' })
        .points,
    ).toEqual([{ date: window.date, knowledgeAdded: 0, businessDataAdded: 4 }])
  })
  it('模型调用和知识引用独立；热点平局按 ID，零引用知识不入榜', () => {
    const data = smallDataset()
    expect(calculateHotAssets(data, { limit: 5 })).toEqual([
      { kind: 'knowledge', id: 'knowledge-a', title: '基准规则', referenceCount: 2, rank: 1 },
      { kind: 'knowledge', id: 'knowledge-b', title: '材料规则', referenceCount: 2, rank: 2 },
    ])
    expect(calculateHotAssets(data, { limit: 1 })).toHaveLength(1)
    expect(calculateHotAssets(data, { endDate: '2026-10-19', days: 1 })).toEqual([])
    data.usageEvents.reverse()
    expect(calculateHotAssets(data, { limit: 1 })[0]!.id).toBe('knowledge-a')
    data.usageEvents = data.usageEvents.filter((event) => event.type === 'model_invoked')
    expect(calculateHotAssets(data, {})).toEqual([])
    expect(calculateOverview(data).modelInvocationsToday).toBe(2)
  })
  it('分类互斥、业务分类及模型分类分别守恒，百分比分配可解释', () => {
    const distribution = calculateKnowledgeDistribution(smallDataset())
    expect(distribution.categories.map((item) => item.percentage)).toEqual([33.34, 33.33, 33.33])
    expect(distribution.categories.reduce((sum, item) => sum + item.count, 0)).toBe(
      distribution.total,
    )
    const data = generateFoundationMock(foundationDemoConfig)
    const overview = calculateOverview(data)
    const summary = calculateResourceSummary(data)
    expect(overview.totalAssets).toBe(overview.knowledgeCount + overview.businessDataCount)
    expect(summary.businessResources.reduce((sum, item) => sum + item.count, 0)).toBe(
      overview.businessDataCount,
    )
    expect(summary.models.byType.reduce((sum, item) => sum + item.count, 0)).toBe(
      overview.modelCount,
    )
    expect(summary.models.byIntegrationStatus.reduce((sum, item) => sum + item.count, 0)).toBe(
      overview.modelCount,
    )
    expect(
      calculateKnowledgeDistribution(data).categories.reduce(
        (sum, item) => sum + Math.round(item.percentage * 100),
        0,
      ),
    ).toBe(10000)
  })
  it('生成数据的趋势、调用数和热点逐条追溯至原始记录', () => {
    const data = generateFoundationMock(foundationDemoConfig)
    const trend = calculateGrowthTrend(data, {})
    for (const point of trend.points) {
      expect(point.knowledgeAdded).toBe(
        data.knowledge.filter((item) => businessDate(item.createdAt, data.timeZone) === point.date)
          .length,
      )
      expect(point.businessDataAdded).toBe(
        [...data.parts, ...data.processPlans, ...data.machines, ...data.tools].filter(
          (item) => businessDate(item.createdAt, data.timeZone) === point.date,
        ).length,
      )
      expect(calculateOverview(data, { date: point.date }).addedToday).toBe(
        point.knowledgeAdded + point.businessDataAdded,
      )
    }
    for (const hot of calculateHotAssets(data, { limit: 100 })) {
      expect(data.knowledge.some((item) => item.id === hot.id && item.title === hot.title)).toBe(
        true,
      )
      expect(hot.referenceCount).toBe(
        data.usageEvents.filter(
          (event) =>
            event.type === 'knowledge_referenced' &&
            event.knowledgeId === hot.id &&
            businessDate(event.occurredAt, data.timeZone) >= trend.startDate &&
            businessDate(event.occurredAt, data.timeZone) <= trend.endDate,
        ).length,
      )
    }
    expect(calculateOverview(data).modelInvocationsToday).toBe(
      data.usageEvents.filter(
        (event) =>
          event.type === 'model_invoked' &&
          businessDate(event.occurredAt, data.timeZone) === foundationDemoConfig.asOfDate,
      ).length,
    )
  })
  it('空数据保持完整分类和日期，不用零值掩盖非法数据', () => {
    const data = emptyDataset()
    expect(calculateOverview(data)).toMatchObject({
      totalAssets: 0,
      addedToday: 0,
      knowledgeCount: 0,
      businessDataCount: 0,
      modelCount: 0,
      modelInvocationsToday: 0,
    })
    expect(calculateGrowthTrend(data, {}).points).toHaveLength(7)
    expect(
      calculateKnowledgeDistribution(data).categories.every(
        (item) => item.count === 0 && item.percentage === 0,
      ),
    ).toBe(true)
    expect(calculateResourceSummary(data).models.total).toBe(0)
    expect(calculateHotAssets(data, {})).toEqual([])
    const invalid = smallDataset()
    invalid.parts = []
    for (const calculate of [
      () => calculateOverview(invalid),
      () => calculateGrowthTrend(invalid, {}),
      () => calculateKnowledgeDistribution(invalid),
      () => calculateResourceSummary(invalid),
      () => calculateHotAssets(invalid, {}),
    ])
      expect(calculate).toThrow(expect.objectContaining({ code: 'data_integrity' }))
  })
})

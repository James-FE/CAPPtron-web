import { describe, expect, expectTypeOf, it } from 'vitest'
import { readFoundationExample } from '../example'
import { MockDataFoundationReader } from '../mock/MockDataFoundationReader'
import { foundationDemoConfig } from '../mock/mockConfig'
import type { DataFoundationReader } from '../reader'
import schema from '../schema/foundation-dataset.schema.json'
import type {
  FoundationDataset,
  FoundationResponse,
  Knowledge,
  Machine,
  Model,
  Operation,
  Part,
  ProcessPlan,
  Tool,
} from '../types'
import { validateFoundationDataset } from '../validation'
import { smallDataset } from './fixtures'

// 只为消费示例所需的查询提供预先验算响应；不导入生成器或统计实现。
function independentReader(): DataFoundationReader {
  const dataset = validateFoundationDataset(smallDataset())
  const response = <T>(data: T): FoundationResponse<T> =>
    structuredClone({
      data,
      meta: {
        schemaVersion: dataset.schemaVersion,
        datasetVersion: dataset.datasetVersion,
        dataMode: dataset.dataMode,
        asOf: dataset.asOf,
        timeZone: dataset.timeZone,
      },
    })
  return {
    getOverview: async () =>
      response({
        date: '2026-10-20',
        totalAssets: 8,
        addedToday: 4,
        knowledgeCount: 3,
        businessDataCount: 5,
        modelCount: 1,
        modelInvocationsToday: 2,
      }),
    getGrowthTrend: async () =>
      response({
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
      }),
    getKnowledgeDistribution: async () =>
      response({
        total: 3,
        categories: [
          { category: 'industry', count: 1, percentage: 33.34 },
          { category: 'institute', count: 1, percentage: 33.33 },
          { category: 'experience', count: 1, percentage: 33.33 },
        ],
      }),
    getResourceSummary: async () =>
      response({
        businessDataCount: 5,
        businessResources: [
          { kind: 'part', count: 2 },
          { kind: 'process_plan', count: 1 },
          { kind: 'machine', count: 1 },
          { kind: 'tool', count: 1 },
        ],
        models: {
          total: 1,
          byType: [
            { modelType: 'general_llm', count: 0 },
            { modelType: 'domain_model', count: 0 },
            { modelType: 'feature_recognition', count: 0 },
            { modelType: 'process_planning', count: 1 },
            { modelType: 'parameter_recommendation', count: 0 },
            { modelType: 'engineering_calculation', count: 0 },
          ],
          byIntegrationStatus: [
            { integrationStatus: 'not_connected', count: 1 },
            { integrationStatus: 'configured', count: 0 },
            { integrationStatus: 'available', count: 0 },
            { integrationStatus: 'unavailable', count: 0 },
          ],
        },
      }),
    getHotAssets: async () =>
      response([
        { kind: 'knowledge', id: 'knowledge-a', title: '基准规则', referenceCount: 2, rank: 1 },
        { kind: 'knowledge', id: 'knowledge-b', title: '材料规则', referenceCount: 2, rank: 2 },
      ]),
    listAssets: async () =>
      response({
        total: 2,
        page: 1,
        pageSize: 10,
        items: [...dataset.parts].reverse().map((part) => ({
          kind: 'part' as const,
          id: part.id,
          name: part.name,
          createdAt: part.createdAt,
          provenance: part.provenance,
        })),
      }),
    getAssetDetail: async (kind, id) =>
      response(
        kind === 'part' && dataset.parts.some((part) => part.id === id)
          ? { kind: 'part', asset: dataset.parts.find((part) => part.id === id)! }
          : null,
      ),
  }
}

describe('长期边界与 FE-004B 使用示例', () => {
  it('TypeScript 对象字段与 JSON Schema 对象字段保持一致', () => {
    expectTypeOf<keyof FoundationDataset>().toEqualTypeOf<keyof typeof schema.properties>()
    expectTypeOf<keyof Part>().toEqualTypeOf<keyof typeof schema.definitions.part.properties>()
    expectTypeOf<keyof ProcessPlan>().toEqualTypeOf<
      keyof typeof schema.definitions.processPlan.properties
    >()
    expectTypeOf<keyof Operation>().toEqualTypeOf<
      keyof typeof schema.definitions.operation.properties
    >()
    expectTypeOf<keyof Machine>().toEqualTypeOf<
      keyof typeof schema.definitions.machine.properties
    >()
    expectTypeOf<keyof Machine['capabilities']>().toEqualTypeOf<
      keyof typeof schema.definitions.machine.properties.capabilities.properties
    >()
    expectTypeOf<keyof Tool>().toEqualTypeOf<keyof typeof schema.definitions.tool.properties>()
    expectTypeOf<keyof Tool['specification']>().toEqualTypeOf<
      keyof typeof schema.definitions.tool.properties.specification.properties
    >()
    expectTypeOf<keyof Knowledge>().toEqualTypeOf<
      keyof typeof schema.definitions.knowledge.properties
    >()
    expectTypeOf<keyof Knowledge['applicability']>().toEqualTypeOf<
      keyof typeof schema.definitions.knowledge.properties.applicability.properties
    >()
    expectTypeOf<keyof Model>().toEqualTypeOf<keyof typeof schema.definitions.model.properties>()
  })
  it.each([
    ['生成数据 Reader', () => new MockDataFoundationReader(foundationDemoConfig)],
    ['独立事实集测试 Reader', independentReader],
  ] as const)('同一客户端消费 %s，不感知生成方式', async (_name, create) => {
    const result = await readFoundationExample(create())
    expect(result.overview.data.totalAssets).toBe(
      result.overview.data.knowledgeCount + result.summary.data.businessDataCount,
    )
    expect(result.trend.data.points).toHaveLength(7)
    expect(result.knowledge.data.categories.reduce((sum, item) => sum + item.count, 0)).toBe(
      result.overview.data.knowledgeCount,
    )
    expect(result.page.data.items[0]!.id).toBe(result.detail!.data!.asset.id)
    expect(result.hotAssets.data.every((item) => item.referenceCount > 0)).toBe(true)
  })
  it('独立验算响应与正式实现对同一小型事实集返回相同业务结果', async () => {
    const reference = await readFoundationExample(independentReader())
    const implementation = await readFoundationExample(
      new MockDataFoundationReader(foundationDemoConfig, smallDataset),
    )
    for (const key of ['overview', 'trend', 'knowledge', 'summary', 'hotAssets', 'page'] as const)
      expect(implementation[key].data).toEqual(reference[key].data)
    expect(implementation.detail?.data).toEqual(reference.detail?.data)
  })
})

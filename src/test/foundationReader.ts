import type { DataFoundationReader } from '../api/data-foundation/reader'
import { smallDataset, emptyDataset } from '../api/data-foundation/tests/fixtures'
import { validateFoundationDataset } from '../api/data-foundation/validation'
import {
  assetKinds,
  modelTypes,
  integrationStatuses,
  type AssetDetail,
  type FoundationResponse,
  type FoundationDataMode,
  type DateWindow,
} from '../api/data-foundation/types'

// 独立手写事实与人工验算统计，不使用正式 Mock 生成器或其统计函数。
export function foundationTestReader(
  empty = false,
  mode: FoundationDataMode = 'synthetic_demo',
): DataFoundationReader {
  const dataset = empty ? emptyDataset() : smallDataset()
  dataset.dataMode = mode
  for (const records of [
    dataset.parts,
    dataset.processPlans,
    dataset.machines,
    dataset.tools,
    dataset.knowledge,
    dataset.models,
    dataset.usageEvents,
  ])
    for (const record of records)
      record.provenance = { dataMode: mode, source: 'independent-ui-test' }
  if (mode === 'live') for (const model of dataset.models) model.integrationStatus = 'available'
  validateFoundationDataset(dataset)
  const assets: AssetDetail[] = [
    ...dataset.parts.map((asset) => ({ kind: 'part' as const, asset })),
    ...dataset.processPlans.map((asset) => ({ kind: 'process_plan' as const, asset })),
    ...dataset.machines.map((asset) => ({ kind: 'machine' as const, asset })),
    ...dataset.tools.map((asset) => ({ kind: 'tool' as const, asset })),
    ...dataset.knowledge.map((asset) => ({ kind: 'knowledge' as const, asset })),
    ...dataset.models.map((asset) => ({ kind: 'model' as const, asset })),
  ]
  const response = <T>(data: T, window?: DateWindow): FoundationResponse<T> =>
    structuredClone({
      data,
      meta: {
        schemaVersion: '1.0',
        datasetVersion: 'independent-ui-reader-v1',
        dataMode: mode,
        asOf: dataset.asOf,
        timeZone: dataset.timeZone,
        ...(window ? { window } : {}),
      },
    })
  return {
    getOverview: async () =>
      response(
        {
          date: '2026-10-20',
          totalAssets: empty ? 0 : 8,
          addedToday: empty ? 0 : 4,
          knowledgeCount: empty ? 0 : 3,
          businessDataCount: empty ? 0 : 5,
          modelCount: empty ? 0 : 1,
          modelInvocationsToday: empty ? 0 : 2,
        },
        { startDate: '2026-10-20', endDate: '2026-10-20' },
      ),
    getGrowthTrend: async () =>
      response(
        {
          startDate: '2026-10-14',
          endDate: '2026-10-20',
          points: [14, 15, 16, 17, 18, 19, 20].map((day) => ({
            date: `2026-10-${day}`,
            knowledgeAdded: empty || day < 19 ? 0 : day === 19 ? 1 : 2,
            businessDataAdded: empty || day < 18 ? 0 : day < 20 ? 1 : 2,
          })),
        },
        { startDate: '2026-10-14', endDate: '2026-10-20' },
      ),
    getKnowledgeDistribution: async () =>
      response({
        total: empty ? 0 : 3,
        categories: [
          { category: 'industry', count: empty ? 0 : 1, percentage: empty ? 0 : 33.34 },
          { category: 'institute', count: empty ? 0 : 1, percentage: empty ? 0 : 33.33 },
          { category: 'experience', count: empty ? 0 : 1, percentage: empty ? 0 : 33.33 },
        ],
      }),
    getResourceSummary: async () =>
      response({
        businessDataCount: empty ? 0 : 5,
        businessResources: [
          { kind: 'part', count: empty ? 0 : 2 },
          { kind: 'process_plan', count: empty ? 0 : 1 },
          { kind: 'machine', count: empty ? 0 : 1 },
          { kind: 'tool', count: empty ? 0 : 1 },
        ],
        models: {
          total: empty ? 0 : 1,
          byType: modelTypes.map((modelType) => ({
            modelType,
            count: !empty && modelType === 'process_planning' ? 1 : 0,
          })),
          byIntegrationStatus: integrationStatuses.map((integrationStatus) => ({
            integrationStatus,
            count:
              !empty && integrationStatus === (mode === 'live' ? 'available' : 'not_connected')
                ? 1
                : 0,
          })),
        },
      }),
    getHotAssets: async () =>
      response(
        empty
          ? []
          : [
              {
                kind: 'knowledge',
                id: 'knowledge-a',
                title: '基准规则',
                rank: 1,
                referenceCount: 2,
              },
              {
                kind: 'knowledge',
                id: 'knowledge-b',
                title: '材料规则',
                rank: 2,
                referenceCount: 2,
              },
            ],
        { startDate: '2026-10-14', endDate: '2026-10-20' },
      ),
    listAssets: async (query) => {
      const items = assets
        .map((detail) => ({
          kind: detail.kind,
          ...detail.asset,
          name: detail.kind === 'knowledge' ? detail.asset.title : detail.asset.name,
        }))
        .filter(
          (item) =>
            (!query.kind || query.kind === item.kind) &&
            (!query.keyword || item.name.toLowerCase().includes(query.keyword.toLowerCase())),
        )
        .sort((a, b) => (a.id < b.id ? -1 : 1))
      const page = query.page ?? 1,
        pageSize = query.pageSize ?? 10
      return response({
        total: items.length,
        page,
        pageSize,
        items: items
          .slice((page - 1) * pageSize, page * pageSize)
          .map(({ id, name, kind, createdAt, provenance }) => ({
            id,
            name,
            kind,
            createdAt,
            provenance,
          })),
      })
    },
    getAssetDetail: async (kind, id) =>
      response(
        assetKinds.includes(kind)
          ? (assets.find((item) => item.kind === kind && item.asset.id === id) ?? null)
          : null,
      ),
  }
}

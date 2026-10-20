import type { DataFoundationReader } from './reader'

// FE-004B 可在组合入口注入 Reader；此客户端不需要了解任何生成器或事件数组。
export async function readFoundationExample(dataFoundationReader: DataFoundationReader) {
  const [overview, trend, knowledge, summary, hotAssets, page] = await Promise.all([
    dataFoundationReader.getOverview(),
    dataFoundationReader.getGrowthTrend({ days: 7 }),
    dataFoundationReader.getKnowledgeDistribution(),
    dataFoundationReader.getResourceSummary(),
    dataFoundationReader.getHotAssets({ limit: 5 }),
    dataFoundationReader.listAssets({ kind: 'part', page: 1, pageSize: 10 }),
  ])
  const first = page.data.items[0]
  const detail = first ? await dataFoundationReader.getAssetDetail(first.kind, first.id) : null
  return { overview, trend, knowledge, summary, hotAssets, page, detail }
}

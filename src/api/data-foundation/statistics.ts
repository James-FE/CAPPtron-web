import { compareText } from './assets'
import { resolveOverviewQuery, resolveWindow } from './queries'
import { businessDate, shiftDate } from './time'
import {
  integrationStatuses,
  knowledgeCategories,
  modelTypes,
  type FoundationDataset,
  type FoundationOverview,
  type GrowthTrend,
  type HotAsset,
  type HotAssetQuery,
  type KnowledgeDistribution,
  type OverviewQuery,
  type ResourceSummary,
  type TrendQuery,
} from './types'
import { validateFoundationDataset } from './validation'

function businessResources(dataset: FoundationDataset) {
  return [...dataset.parts, ...dataset.processPlans, ...dataset.machines, ...dataset.tools]
}
export function calculateOverview(
  dataset: FoundationDataset,
  query: OverviewQuery = {},
): FoundationOverview {
  validateFoundationDataset(dataset)
  const { date, timeZone } = resolveOverviewQuery(dataset, query)
  const business = businessResources(dataset)
  const assets = [...business, ...dataset.knowledge]
  return {
    date,
    totalAssets: assets.length,
    addedToday: assets.filter((item) => businessDate(item.createdAt, timeZone) === date).length,
    knowledgeCount: dataset.knowledge.length,
    businessDataCount: business.length,
    modelCount: dataset.models.length,
    modelInvocationsToday: dataset.usageEvents.filter(
      (event) =>
        event.type === 'model_invoked' && businessDate(event.occurredAt, timeZone) === date,
    ).length,
  }
}
export function calculateGrowthTrend(dataset: FoundationDataset, query: TrendQuery): GrowthTrend {
  validateFoundationDataset(dataset)
  const window = resolveWindow(dataset, query)
  const points = Array.from({ length: window.days }, (_, index) => ({
    date: shiftDate(window.startDate, index),
    knowledgeAdded: 0,
    businessDataAdded: 0,
  }))
  const byDate = new Map(points.map((point) => [point.date, point]))
  for (const item of dataset.knowledge) {
    const point = byDate.get(businessDate(item.createdAt, window.timeZone))
    if (point) point.knowledgeAdded++
  }
  for (const item of businessResources(dataset)) {
    const point = byDate.get(businessDate(item.createdAt, window.timeZone))
    if (point) point.businessDataAdded++
  }
  return { startDate: window.startDate, endDate: window.endDate, points }
}
export function calculateKnowledgeDistribution(dataset: FoundationDataset): KnowledgeDistribution {
  validateFoundationDataset(dataset)
  const total = dataset.knowledge.length
  const counts = knowledgeCategories.map(
    (category) => dataset.knowledge.filter((item) => item.knowledgeCategory === category).length,
  )
  // 以 0.01 个百分点为单位作最大余数分配；非空时显示值严格加总至 100%。
  const hundredths = counts.map((count) => (total ? Math.floor((count * 10000) / total) : 0))
  if (total) {
    const remainderOrder = counts
      .map((count, index) => ({ index, remainder: (count * 10000) % total }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    const missing = 10000 - hundredths.reduce((sum, value) => sum + value, 0)
    for (let i = 0; i < missing; i++) hundredths[remainderOrder[i]!.index]!++
  }
  return {
    total,
    categories: knowledgeCategories.map((category, index) => ({
      category,
      count: counts[index]!,
      percentage: hundredths[index]! / 100,
    })),
  }
}
export function calculateResourceSummary(dataset: FoundationDataset): ResourceSummary {
  validateFoundationDataset(dataset)
  return {
    businessDataCount: businessResources(dataset).length,
    businessResources: [
      { kind: 'part', count: dataset.parts.length },
      { kind: 'process_plan', count: dataset.processPlans.length },
      { kind: 'machine', count: dataset.machines.length },
      { kind: 'tool', count: dataset.tools.length },
    ],
    models: {
      total: dataset.models.length,
      byType: modelTypes.map((modelType) => ({
        modelType,
        count: dataset.models.filter((item) => item.modelType === modelType).length,
      })),
      byIntegrationStatus: integrationStatuses.map((integrationStatus) => ({
        integrationStatus,
        count: dataset.models.filter((item) => item.integrationStatus === integrationStatus).length,
      })),
    },
  }
}
export function calculateHotAssets(dataset: FoundationDataset, query: HotAssetQuery): HotAsset[] {
  validateFoundationDataset(dataset)
  const window = resolveWindow(dataset, query, true)
  const counts = new Map<string, number>()
  for (const event of dataset.usageEvents) {
    if (event.type !== 'knowledge_referenced') continue
    const date = businessDate(event.occurredAt, window.timeZone)
    if (date >= window.startDate && date <= window.endDate)
      counts.set(event.knowledgeId, (counts.get(event.knowledgeId) ?? 0) + 1)
  }
  const knowledge = new Map(dataset.knowledge.map((item) => [item.id, item]))
  return [...counts]
    .sort(([idA, a], [idB, b]) => b - a || compareText(idA, idB))
    .slice(0, window.limit)
    .map(([id, referenceCount], index) => ({
      kind: 'knowledge',
      id,
      title: knowledge.get(id)!.title,
      referenceCount,
      rank: index + 1,
    }))
}

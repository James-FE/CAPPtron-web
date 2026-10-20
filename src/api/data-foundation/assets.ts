import type { AssetDetail, FoundationDataset } from './types'

export function assetDetails(dataset: FoundationDataset): AssetDetail[] {
  return [
    ...dataset.parts.map((asset): AssetDetail => ({ kind: 'part', asset })),
    ...dataset.processPlans.map((asset): AssetDetail => ({ kind: 'process_plan', asset })),
    ...dataset.machines.map((asset): AssetDetail => ({ kind: 'machine', asset })),
    ...dataset.tools.map((asset): AssetDetail => ({ kind: 'tool', asset })),
    ...dataset.knowledge.map((asset): AssetDetail => ({ kind: 'knowledge', asset })),
    ...dataset.models.map((asset): AssetDetail => ({ kind: 'model', asset })),
  ]
}

// 不依赖宿主机 locale；所有次级排序统一使用 UTF-16 码元顺序。
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

import { assetDetails, compareText } from '../assets'
import {
  resolveAssetQuery,
  resolveOverviewQuery,
  resolveWindow,
  validateAssetIdentity,
} from '../queries'
import { FoundationError, type DataFoundationReader } from '../reader'
import {
  calculateGrowthTrend,
  calculateHotAssets,
  calculateKnowledgeDistribution,
  calculateOverview,
  calculateResourceSummary,
} from '../statistics'
import type {
  AssetKind,
  AssetPage,
  AssetQuery,
  AssetSummary,
  DateWindow,
  FoundationDataset,
  FoundationResponse,
  HotAssetQuery,
  OverviewQuery,
  TrendQuery,
} from '../types'
import { validateFoundationDataset } from '../validation'
import { generateFoundationMock } from './generateFoundationMock'
import type { FoundationMockConfig } from './mockConfig'

export class MockDataFoundationReader implements DataFoundationReader {
  private snapshot?: Promise<FoundationDataset>
  private readonly load: () => unknown | Promise<unknown>

  // load 仅是数据边界的测试注入点；页面只依赖 DataFoundationReader。
  constructor(config: FoundationMockConfig, load?: () => unknown | Promise<unknown>) {
    const frozenConfig = { ...config }
    this.load = load ?? (() => generateFoundationMock(frozenConfig))
  }
  private dataset(): Promise<FoundationDataset> {
    if (!this.snapshot) {
      this.snapshot = Promise.resolve()
        .then(() => this.load())
        .then((value) => {
          const dataset = validateFoundationDataset(value)
          if (dataset.dataMode !== 'synthetic_demo')
            throw new FoundationError('data_integrity', 'Mock Reader 不接受 live 数据')
          return structuredClone(dataset)
        })
        .catch((error: unknown) => {
          // 失败不建立快照；允许显式重试，首次成功后保持该实例的数据不变。
          this.snapshot = undefined
          if (error instanceof FoundationError) throw error
          throw new FoundationError('read_failed', '数据底座读取失败')
        })
    }
    return this.snapshot
  }
  private response<T>(
    dataset: FoundationDataset,
    data: T,
    timeZone = dataset.timeZone,
    window?: DateWindow,
  ): FoundationResponse<T> {
    return structuredClone({
      data,
      meta: {
        schemaVersion: dataset.schemaVersion,
        datasetVersion: dataset.datasetVersion,
        dataMode: dataset.dataMode,
        asOf: dataset.asOf,
        timeZone,
        ...(window ? { window } : {}),
      },
    })
  }
  async getOverview(query: OverviewQuery = {}) {
    const dataset = await this.dataset()
    const { date, timeZone } = resolveOverviewQuery(dataset, query)
    return this.response(dataset, calculateOverview(dataset, query), timeZone, {
      startDate: date,
      endDate: date,
    })
  }
  async getGrowthTrend(query: TrendQuery) {
    const dataset = await this.dataset()
    const window = resolveWindow(dataset, query)
    return this.response(dataset, calculateGrowthTrend(dataset, query), window.timeZone, {
      startDate: window.startDate,
      endDate: window.endDate,
    })
  }
  async getKnowledgeDistribution() {
    const dataset = await this.dataset()
    return this.response(dataset, calculateKnowledgeDistribution(dataset))
  }
  async getResourceSummary() {
    const dataset = await this.dataset()
    return this.response(dataset, calculateResourceSummary(dataset))
  }
  async getHotAssets(query: HotAssetQuery) {
    const dataset = await this.dataset()
    const window = resolveWindow(dataset, query, true)
    return this.response(dataset, calculateHotAssets(dataset, query), window.timeZone, {
      startDate: window.startDate,
      endDate: window.endDate,
    })
  }
  async listAssets(query: AssetQuery) {
    const dataset = await this.dataset()
    const normalized = resolveAssetQuery(query)
    const items: AssetSummary[] = assetDetails(dataset)
      .map((detail) => ({
        kind: detail.kind,
        id: detail.asset.id,
        name: detail.kind === 'knowledge' ? detail.asset.title : detail.asset.name,
        createdAt: detail.asset.createdAt,
        provenance: detail.asset.provenance,
      }))
      .filter(
        (item) =>
          (!normalized.kind || normalized.kind === item.kind) &&
          item.name.normalize('NFKC').toLowerCase().includes(normalized.keyword),
      )
    items.sort((a, b) => {
      const primary =
        normalized.sortBy === 'createdAt'
          ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
          : compareText(a[normalized.sortBy], b[normalized.sortBy])
      return (
        primary * (normalized.sortDirection === 'asc' ? 1 : -1) ||
        compareText(a.kind, b.kind) ||
        compareText(a.id, b.id)
      )
    })
    const start = (normalized.page - 1) * normalized.pageSize
    const page: AssetPage = {
      items: items.slice(start, start + normalized.pageSize),
      total: items.length,
      page: normalized.page,
      pageSize: normalized.pageSize,
    }
    return this.response(dataset, page)
  }
  async getAssetDetail(kind: AssetKind, id: string) {
    validateAssetIdentity(kind, id)
    const dataset = await this.dataset()
    return this.response(
      dataset,
      assetDetails(dataset).find((item) => item.kind === kind && item.asset.id === id) ?? null,
    )
  }
}

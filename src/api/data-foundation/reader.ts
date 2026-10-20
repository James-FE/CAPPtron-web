import type {
  AssetDetail,
  AssetKind,
  AssetPage,
  AssetQuery,
  FoundationOverview,
  FoundationResponse,
  GrowthTrend,
  HotAsset,
  HotAssetQuery,
  KnowledgeDistribution,
  OverviewQuery,
  ResourceSummary,
  TrendQuery,
} from './types'

export interface DataFoundationReader {
  getOverview(query?: OverviewQuery): Promise<FoundationResponse<FoundationOverview>>
  getGrowthTrend(query: TrendQuery): Promise<FoundationResponse<GrowthTrend>>
  getKnowledgeDistribution(): Promise<FoundationResponse<KnowledgeDistribution>>
  getResourceSummary(): Promise<FoundationResponse<ResourceSummary>>
  getHotAssets(query: HotAssetQuery): Promise<FoundationResponse<HotAsset[]>>
  listAssets(query: AssetQuery): Promise<FoundationResponse<AssetPage>>
  getAssetDetail(kind: AssetKind, id: string): Promise<FoundationResponse<AssetDetail | null>>
}

export type FoundationErrorCode =
  'invalid_query' | 'read_failed' | 'contract_incompatible' | 'invalid_data' | 'data_integrity'
export type FoundationIssue = { path: string; message: string }

export class FoundationError extends Error {
  readonly code: FoundationErrorCode
  readonly issues: FoundationIssue[]
  constructor(code: FoundationErrorCode, message: string, issues: FoundationIssue[] = []) {
    super(
      issues.length
        ? `${message}：${issues
            .slice(0, 5)
            .map((issue) => `${issue.path} ${issue.message}`)
            .join('；')}`
        : message,
    )
    this.name = 'FoundationError'
    this.code = code
    this.issues = issues
  }
}

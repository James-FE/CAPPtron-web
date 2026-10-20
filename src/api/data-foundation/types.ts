// 工业资源契约；独立于案例库、页面 ViewModel 和制造执行状态。
export const assetKinds = ['part', 'process_plan', 'machine', 'tool', 'knowledge', 'model'] as const
export type AssetKind = (typeof assetKinds)[number]
export type BusinessAssetKind = Exclude<AssetKind, 'knowledge' | 'model'>
export const partCategories = ['shaft', 'ring', 'disc', 'plate', 'housing'] as const
export type PartCategory = (typeof partCategories)[number]
export const operationMethods = ['turning', 'milling', 'drilling', 'boring', 'parting'] as const
export type OperationMethod = (typeof operationMethods)[number]
export const manufacturingTypes = ['turning', 'milling', 'drilling', 'turn_mill', 'mixed'] as const
export type ManufacturingType = (typeof manufacturingTypes)[number]
export const machineTypes = [
  'cnc_lathe',
  'vertical_machining_center',
  'cnc_mill',
  'drill',
  'turn_mill',
] as const
export type MachineType = (typeof machineTypes)[number]
export const toolTypes = [
  'external_turning',
  'internal_turning',
  'parting',
  'end_mill',
  'drill',
  'boring_bar',
] as const
export type ToolType = (typeof toolTypes)[number]
export const knowledgeCategories = ['industry', 'institute', 'experience'] as const
export type KnowledgeCategory = (typeof knowledgeCategories)[number]
export const knowledgeTopics = [
  'process_rules',
  'material',
  'tool_selection',
  'fixturing',
  'parameters',
  'quality',
] as const
export type KnowledgeTopic = (typeof knowledgeTopics)[number]
export const modelTypes = [
  'general_llm',
  'domain_model',
  'feature_recognition',
  'process_planning',
  'parameter_recommendation',
  'engineering_calculation',
] as const
export type ModelType = (typeof modelTypes)[number]
export const integrationStatuses = [
  'not_connected',
  'configured',
  'available',
  'unavailable',
] as const
export type IntegrationStatus = (typeof integrationStatuses)[number]
export const supportedTasks = [
  'process_planning',
  'parameter_recommendation',
  'feature_recognition',
  'knowledge_retrieval',
  'resource_matching',
  'engineering_calculation',
] as const
export type SupportedTask = (typeof supportedTasks)[number]

export type FoundationDataMode = 'synthetic_demo' | 'live'
export type Provenance = { dataMode: FoundationDataMode; source: string }
export type AssetReference = { kind: AssetKind; id: string }
export type ResourceBase = { id: string; createdAt: string; provenance: Provenance }
export type Part = ResourceBase & {
  name: string
  category: PartCategory
  material: string
  features: string[]
  description: string
}
export type Operation = {
  id: string
  sequence: number
  name: string
  method: OperationMethod
  machineId?: string
  toolIds: string[]
  knowledgeIds: string[]
}
export type ProcessPlan = ResourceBase & {
  name: string
  partId: string
  version: string
  manufacturingType: ManufacturingType
  operations: Operation[]
}
export type Quantity<U extends string> = { value: number; unit: U }
export type Machine = ResourceBase & {
  name: string
  machineType: MachineType
  manufacturer?: string
  capabilities: {
    axisCount?: number
    maxSpindleSpeed?: Quantity<'r/min'>
    workEnvelope?: { x: number; y: number; z: number; unit: 'mm' }
  }
  supportedOperations: OperationMethod[]
}
export type Tool = ResourceBase & {
  name: string
  toolType: ToolType
  specification: {
    description: string
    diameter?: Quantity<'mm'>
    cuttingEdgeCount?: number
  }
  supportedOperations: OperationMethod[]
  compatibleMachineTypes: MachineType[]
}
export type Knowledge = ResourceBase & {
  title: string
  content: string
  topic: KnowledgeTopic
  knowledgeCategory: KnowledgeCategory
  applicability: {
    operations: OperationMethod[]
    partCategories: PartCategory[]
    materials: string[]
  }
  relatedAssets: AssetReference[]
}
export type Model = ResourceBase & {
  name: string
  modelType: ModelType
  supportedTasks: SupportedTask[]
  integrationStatus: IntegrationStatus
  version?: string
}
type EventBase = { id: string; occurredAt: string; provenance: Provenance; scenario?: string }
export type UsageEvent =
  | (EventBase & { type: 'knowledge_referenced'; knowledgeId: string })
  | (EventBase & { type: 'model_invoked'; modelId: string; task?: SupportedTask })

export type FoundationDataset = {
  schemaVersion: '1.0'
  datasetVersion: string
  dataMode: FoundationDataMode
  asOf: string
  timeZone: string
  parts: Part[]
  processPlans: ProcessPlan[]
  machines: Machine[]
  tools: Tool[]
  knowledge: Knowledge[]
  models: Model[]
  usageEvents: UsageEvent[]
}
export type DateWindow = { startDate: string; endDate: string }
export type FoundationResponse<T> = {
  data: T
  meta: {
    schemaVersion: '1.0'
    datasetVersion: string
    dataMode: FoundationDataMode
    asOf: string
    timeZone: string
    window?: DateWindow
  }
}
export type OverviewQuery = { date?: string; timeZone?: string }
export type TrendQuery = { days?: number; endDate?: string; timeZone?: string }
export type HotAssetQuery = TrendQuery & { limit?: number }
export type AssetQuery = {
  kind?: AssetKind
  keyword?: string
  sortBy?: 'name' | 'createdAt' | 'id'
  sortDirection?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}
export type FoundationOverview = {
  date: string
  totalAssets: number
  addedToday: number
  knowledgeCount: number
  businessDataCount: number
  modelCount: number
  modelInvocationsToday: number
}
export type GrowthTrend = DateWindow & {
  points: { date: string; knowledgeAdded: number; businessDataAdded: number }[]
}
export type KnowledgeDistribution = {
  total: number
  categories: { category: KnowledgeCategory; count: number; percentage: number }[]
}
export type ResourceSummary = {
  businessDataCount: number
  businessResources: { kind: BusinessAssetKind; count: number }[]
  models: {
    total: number
    byType: { modelType: ModelType; count: number }[]
    byIntegrationStatus: { integrationStatus: IntegrationStatus; count: number }[]
  }
}
export type HotAsset = {
  kind: 'knowledge'
  id: string
  title: string
  referenceCount: number
  rank: number
}
export type AssetSummary = ResourceBase & { kind: AssetKind; name: string }
export type AssetPage = { items: AssetSummary[]; total: number; page: number; pageSize: number }
export type AssetDetail =
  | { kind: 'part'; asset: Part }
  | { kind: 'process_plan'; asset: ProcessPlan }
  | { kind: 'machine'; asset: Machine }
  | { kind: 'tool'; asset: Tool }
  | { kind: 'knowledge'; asset: Knowledge }
  | { kind: 'model'; asset: Model }

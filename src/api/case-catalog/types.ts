// 标准参考数据契约；不引用 React ViewModel，也不保存用户会话或制造审批状态。
export type CaseMetadata = {
  id: string
  name: string
  description: string
  partType: string
  sourceCategory: 'engineering_reference'
  tags: string[]
}
export type CaseVersionReference = {
  version: string
  path: string
  contentDigest: string
}
export type CaseSummary = Omit<CaseMetadata, 'id'> & {
  caseId: string
  versions: CaseVersionReference[]
}
export type CaseIndex = { schemaVersion: '1.0'; cases: CaseSummary[] }
export type CaseField = {
  id: string
  name: string
  value: number | string | null
  unit?: 'mm' | 'm/min' | 'mm/r' | 'r/min' | 'mm/min' | 'deg' | '%'
  source: 'historical_record' | 'template' | 'upstream' | 'human' | 'unknown'
  status: 'provided' | 'missing' | 'pending'
  inputKind: 'number' | 'text'
  editPolicy: 'read_only' | 'demo_input'
  requirement: 'optional' | 'demo_required'
  description?: string
}
export type CaseOperation = {
  id: string
  sequence: number
  name: string
  source: string
  setup?: string
  notes?: string
  steps: {
    id: string
    sequence: number
    name: string
    description?: string
    parameters: CaseField[]
  }[]
  parameters: CaseField[]
  resources: {
    id: string
    name: string
    kind: 'tool' | 'machine' | 'other'
    description?: string
    status: 'demo' | 'pending'
  }[]
  onsiteFields: CaseField[]
}
export type CaseProcessPlan = {
  id: string
  name: string
  partName: string
  sourceDescription: string
  initialOperationId?: string
  operations: CaseOperation[]
  taskFields: CaseField[]
}
type VersionIdentity = { caseId: string; caseVersion: string; planId: string }
export type ProgramAsset = VersionIdentity & {
  id: string
  kind: 'nc'
  source: string
  sha256?: string
  sizeBytes?: number
  availability: 'metadata_only' | 'unavailable'
  boundary: string
}
export type VerificationEvidence = VersionIdentity & {
  id: string
  programAssetIds: string[]
  subject: string
  method: string
  result: 'passed_with_limits' | 'failed' | 'not_performed'
  conditions: string[]
  sources: string[]
  limitations: string[]
}
export type CaseDocument = {
  schemaVersion: '1.0'
  case: CaseMetadata
  caseVersion: { caseId: string; version: string }
  contentDigest: string
  processPlan: CaseProcessPlan
  programAssets: ProgramAsset[]
  verificationEvidence: VerificationEvidence[]
}
export interface CaseCatalogReader {
  listCases(): Promise<CaseSummary[]>
  getCaseVersion(caseId: string, version: string): Promise<CaseDocument>
}

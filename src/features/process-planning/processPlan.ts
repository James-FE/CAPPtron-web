// 前端展示契约；不代表后端已提供这些字段或完成制造校核。
export type Parameter = {
  id: string
  name: string
  value: string | number | null
  unit?: string
  source: 'mock' | 'template' | 'upstream' | 'human' | 'unknown'
  status: 'provided' | 'missing' | 'pending'
  editable: boolean
  inputKind: 'number' | 'text'
}

export type ProductionResource = {
  id: string
  name: string
  kind: 'tool' | 'machine' | 'other'
  description?: string
  status: 'demo' | 'pending'
}

export type ProcessStep = {
  id: string
  sequence: number
  name: string
  description?: string
  parameters: Parameter[]
}

export type ProcessOperation = {
  id: string
  sequence: number
  name: string
  source: string
  setup?: string
  notes?: string
  steps: ProcessStep[]
  parameters: Parameter[]
  resources: ProductionResource[]
  onsiteMeasurements: Parameter[]
}

export type ProcessPlan = {
  id: string
  name: string
  partName: string
  origin: 'mock'
  sourceDescription: string
  operations: ProcessOperation[]
}

export function resolveOperation(plan: ProcessPlan, selectedId: string | null) {
  return (
    plan.operations.find((operation) => operation.id === selectedId) ?? plan.operations[0] ?? null
  )
}

export function validateDraft(parameter: Parameter, value: string): string | null {
  if (!parameter.editable) return '此字段不允许本地编辑。'
  if (!value.trim()) return '尚未填写，仍待补充。'
  if (parameter.inputKind === 'number' && !Number.isFinite(Number(value))) {
    return '请输入有限数值；单位见字段说明。'
  }
  // 仅检查输入格式；没有制造契约时，不臆造工艺范围或安全结论。
  return null
}

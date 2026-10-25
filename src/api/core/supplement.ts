import type { Drafts, Parameter, ProcessPlan } from '../../features/process-planning/processPlan'
import { draftKey, validateDraft } from '../../features/process-planning/processPlan'

// Golden-B7 原型现场采集清单；仅作人工信息记录，不是 CAM 参数或制造合格判定。
export const supplementSchema = 'golden-b7-onsite-record-v1'
const field = (id: string, name: string, unit?: string): Parameter => ({
  id,
  name,
  unit,
  value: null,
  source: 'unknown',
  status: 'missing',
  editable: true,
  required: true,
  inputKind: unit ? 'number' : 'text',
  description: '人工现场记录；提交后保存到任务反馈，不自动应用到 CAM。',
})
export function attachSupplementFields(plan: ProcessPlan, templateId: string) {
  if (templateId !== 'golden-b7') return
  plan.taskMeasurements = [
    field('stock-od', '现场毛坯外径', 'mm'),
    field('stock-id', '现场毛坯预孔直径', 'mm'),
    field('stock-length', '现场毛坯长度', 'mm'),
    field('work-offset', '工件零点 / 偏置核对'),
    field('fixture', '装夹方式与夹具核对'),
  ]
  const bore = plan.operations.find((op) => op.id === 'ring-op-5')
  if (bore) bore.onsiteMeasurements = [field('bore-surface-ra', '内孔表面粗糙度要求 Ra', 'μm')]
}
export function supplementFields(plan: ProcessPlan) {
  return [
    ...(plan.taskMeasurements ?? []).map((p) => ({ key: draftKey(plan.id, 'task', p.id), p })),
    ...plan.operations.flatMap((op) =>
      op.onsiteMeasurements.map((p) => ({ key: draftKey(op.id, 'onsite', p.id), p })),
    ),
  ]
}
export function supplementValues(plan: ProcessPlan, drafts: Drafts) {
  return Object.fromEntries(
    supplementFields(plan).map(({ key, p }) => {
      const value = drafts[key] ?? String(p.value ?? '')
      const error = validateDraft(p, value)
      if (error || !value.trim()) throw new Error(`${p.name}：${error ?? '请填写'}`)
      if (p.inputKind === 'number' && Number(value) < 0) throw new Error(`${p.name}：不能为负数`)
      return [key, value]
    }),
  )
}
export type SupplementList = {
  feedback_version: number
  items: {
    feedback_id: string
    status: string
    supplement_schema_version?: string
    supplement?: { values?: Record<string, unknown> }
    expected_feedback_version: number
  }[]
}
export function applySupplement(plan: ProcessPlan, list: SupplementList) {
  const latest = list.items
    .filter((x) => x.status === 'active' && x.supplement_schema_version === supplementSchema)
    .sort((a, b) => b.expected_feedback_version - a.expected_feedback_version)[0]
  if (!latest) return false
  for (const { key, p } of supplementFields(plan)) {
    const value = latest.supplement?.values?.[key]
    if (typeof value !== 'string' || validateDraft(p, value)) continue
    p.value = value
    p.source = 'human'
    p.status = 'provided'
  }
  return true
}

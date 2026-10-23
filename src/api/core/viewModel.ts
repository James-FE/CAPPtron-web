import type { CoreOperation, PlanProducedDto, ParameterRule } from './dto'

export type LiveParameter = {
  id: string
  name: string
  value: string | number | boolean | null
  unit?: string
  source: 'upstream' | 'historical_record'
  editable: boolean
  allowedValues?: unknown[]
  description?: string
}
export type LiveProcessPlan = {
  id: string
  origin: 'live'
  name: string
  partName: string
  task_id: string
  result_id: string
  revision: number
  operations: {
    id: string
    sequence: number
    name: string
    steps: { id: string; sequence: number; name: string }[]
    parameters: LiveParameter[]
    resources: {
      id: string
      name: string
      kind: string
      status: string
      source: 'historical_record'
    }[]
    referenceDisplaySteps: unknown[]
  }[]
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function ruleFor(rules: ParameterRule[], op: CoreOperation, index: number, id: string) {
  const expectedPath = `/operations/${index}/attributes/parameters/${id.replace(/~/g, '~0').replace(/\//g, '~1')}`
  return rules.find(
    (rule) => rule.operation_id === op.id && rule.parameter_id === id && rule.path === expectedPath,
  )
}
export function toLiveProcessPlan(plan: PlanProducedDto): LiveProcessPlan {
  const payload = plan.payload
  const rules = Array.isArray(payload.extensions.parameter_rules)
    ? (payload.extensions.parameter_rules as ParameterRule[])
    : []
  const partName = typeof payload.part.name === 'string' ? payload.part.name : '未提供零件名称'
  return {
    id: JSON.stringify([plan.task_id, plan.result_id, plan.revision]),
    origin: 'live',
    name: `工艺方案 · 修订 ${plan.revision}`,
    partName,
    task_id: plan.task_id,
    result_id: plan.result_id,
    revision: plan.revision,
    operations: payload.operations.map((op, index) => {
      const attrs = op.attributes
      const metadata = record(attrs.parameter_metadata)
      const parameters: LiveParameter[] = Object.entries(record(attrs.parameters)).map(
        ([id, value]) => {
          const meta = record(metadata[id])
          const rule = ruleFor(rules, op, index, id)
          const editable =
            meta.edit_policy === 'replace' &&
            rule?.edit_policy === 'replace' &&
            meta.unit === rule.unit &&
            JSON.stringify(meta.allowed_values) === JSON.stringify(rule.allowed_values) &&
            Array.isArray(rule.allowed_values) &&
            rule.allowed_values.includes(value)
          return {
            id,
            name: typeof meta.name === 'string' ? meta.name : id,
            value: value as LiveParameter['value'],
            ...(typeof meta.unit === 'string' ? { unit: meta.unit } : {}),
            source: 'upstream' as const,
            editable,
            ...(editable ? { allowedValues: rule!.allowed_values } : {}),
          }
        },
      )
      const reference = Array.isArray(attrs.source_parameters) ? attrs.source_parameters : []
      for (const raw of reference) {
        const item = record(raw)
        if (typeof item.id !== 'string' || parameters.some((parameter) => parameter.id === item.id))
          continue
        if (typeof item.value !== 'string' && typeof item.value !== 'number' && item.value !== null)
          continue
        parameters.push({
          id: item.id,
          name: typeof item.name === 'string' ? item.name : item.id,
          value: item.value,
          ...(typeof item.unit === 'string' ? { unit: item.unit } : {}),
          source: 'historical_record',
          editable: false,
          ...(typeof item.description === 'string' ? { description: item.description } : {}),
        })
      }
      const references = Array.isArray(attrs.resources) ? attrs.resources : []
      const resources = references.flatMap((raw) => {
        const item = record(raw)
        return typeof item.id === 'string' && typeof item.name === 'string'
          ? [
              {
                id: item.id,
                name: item.name,
                kind: typeof item.kind === 'string' ? item.kind : 'other',
                status: typeof item.status === 'string' ? item.status : 'pending',
                source: 'historical_record' as const,
              },
            ]
          : []
      })
      return {
        id: op.id,
        sequence: op.sequence,
        name: op.name,
        steps: op.steps.map((step) => ({
          id: step.id,
          sequence: step.sequence,
          name: step.content,
        })),
        parameters,
        resources,
        referenceDisplaySteps: Array.isArray(attrs.display_steps) ? attrs.display_steps : [],
      }
    }),
  }
}

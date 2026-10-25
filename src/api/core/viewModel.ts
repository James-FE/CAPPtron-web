import { attachSupplementFields } from './supplement'
import type { Drafts, Parameter, ProcessPlan } from '../../features/process-planning/processPlan'
import { draftKey, validateDraft } from '../../features/process-planning/processPlan'
import type { Attributes, LivePlan, Deployment } from './contracts'

export function toProcessPlan(plan: LivePlan, deployment: Deployment): ProcessPlan {
  const ext = plan.payload.extensions
  if (
    plan.provider !== 'template' ||
    !['template-plan-v1', 'template-plan-v1-integration'].includes(plan.schema_version) ||
    ext.template.digest !== deployment.template.digest ||
    ext.template.id !== deployment.template.id ||
    ext.template.version !== deployment.template.version
  )
    throw new Error('工艺结果的模板身份或输出协议与部署配置不匹配')
  const ordered = <T extends { id: string; sequence: number }>(items: T[]) => {
    if (
      !Array.isArray(items) ||
      items.some((x) => !x.id || !Number.isInteger(x.sequence) || x.sequence < 1) ||
      new Set(items.map((x) => x.id)).size !== items.length ||
      new Set(items.map((x) => x.sequence)).size !== items.length
    )
      throw new Error('工序/工步身份或顺序不合法')
    return [...items].sort((a, b) => a.sequence - b.sequence)
  }
  const parameters = (
    attributes: Attributes,
    operationId: string,
    editable: boolean,
  ): Parameter[] =>
    Object.entries(attributes.parameters ?? {}).map(([id, raw]) => {
      const meta = attributes.parameter_metadata?.[id]
      const rule = ext.parameter_rules?.find(
        (r) => r.operation_id === operationId && r.parameter_id === id,
      )
      const allowed =
        editable &&
        meta?.edit_policy === 'replace' &&
        rule?.edit_policy === 'replace' &&
        rule.value_type === 'number' &&
        meta.unit === rule.unit &&
        !!meta.unit &&
        meta.source?.sha256 === ext.execution_profile_digest &&
        ext.execution_profile_digest === deployment.execution_profile_digest &&
        !!meta.allowed_values?.length &&
        meta.allowed_values.every((v) => rule.allowed_values?.includes(v))
          ? meta.allowed_values
          : undefined
      return {
        id,
        name: meta?.name ?? id,
        value:
          typeof raw === 'number' || typeof raw === 'string'
            ? raw
            : raw == null
              ? null
              : JSON.stringify(raw),
        unit: meta?.unit,
        editable: !!allowed,
        allowedValues: allowed,
        inputKind: typeof raw === 'number' ? 'number' : 'text',
        source: 'upstream',
        status: raw == null ? 'missing' : 'provided',
        description: `${meta?.unit ? '' : '单位未提供 · '}${meta?.source ? `${meta.source.kind} · ${meta.source.resource_id} · ${meta.source.sha256} · ${meta.source.pointer}` : '参数描述来源未提供，保持只读'}`,
      }
    })
  const model: ProcessPlan = {
    id: plan.task_id,
    verifiedGeometry: ext.verified_part,
    name: 'Core 工艺方案',
    partName: plan.payload.part?.name ?? '当前 STEP',
    origin: 'live',
    sourceDescription: `Core · ${plan.task_id} · revision ${plan.revision} · ${plan.schema_version}`,
    operations: ordered(plan.payload.operations).map((op) => ({
      id: op.id,
      sequence: op.sequence,
      name: op.name,
      source: `Core · ${plan.result_id} / r${plan.revision}`,
      setup: op.attributes.setup ?? '未提供',
      notes: op.attributes.notes ?? '未提供',
      parameters: parameters(op.attributes, op.id, true),
      onsiteMeasurements: [],
      resources: (op.attributes.resources ?? [])
        .filter((r) => r.id && r.name && ['tool', 'machine', 'other'].includes(r.kind))
        .map((r) => ({ ...r, status: 'pending' })),
      steps: ordered(op.steps).map((step) => ({
        id: step.id,
        sequence: step.sequence,
        name: step.content,
        parameters: parameters(step.attributes ?? {}, op.id, false),
      })),
    })),
  }
  attachSupplementFields(model, ext.template.id)
  return model
}
export function parameterChanges(plan: ProcessPlan, drafts: Drafts) {
  return plan.operations.flatMap((op) =>
    op.parameters.flatMap((parameter) => {
      const value = drafts[draftKey(op.id, 'parameters', parameter.id)]
      if (value === undefined || value === String(parameter.value)) return []
      const error = validateDraft(parameter, value)
      if (error) throw new Error(error)
      return [
        {
          operation_id: op.id,
          parameter_id: parameter.id,
          value: Number(value),
          unit: parameter.unit,
        },
      ]
    }),
  )
}

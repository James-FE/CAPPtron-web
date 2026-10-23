import type { NcRef, PlanRef } from './client'

export type CoreStep = {
  id: string
  sequence: number
  content: string
  attributes: Record<string, unknown>
}
export type CoreOperation = {
  id: string
  sequence: number
  name: string
  steps: CoreStep[]
  attributes: Record<string, unknown>
}
export type ParameterRule = {
  path: string
  operation_id: string
  parameter_id: string
  value_type: string
  unit?: string
  allowed_values?: unknown[]
  edit_policy: string
}
export type PlanProducedDto = {
  schema_version: string
  provider: string
  event_id: string
  task_id: string
  result_id: string
  revision: number
  run_id: string
  trace_id: string
  source_request_id: string
  trigger_request_id: string
  feedback_snapshot: { feedback_version: number; items: unknown[] }
  payload: {
    part: Record<string, unknown>
    blank: Record<string, unknown>
    resources: Record<string, unknown>
    operations: CoreOperation[]
    extensions: Record<string, unknown>
  }
}
export type NcFileDto = {
  file_id: string
  filename: string
  setup_id: string
  sequence: number
  encoding: string
  sha256: string
  size_bytes: number
}
export type NcVersionDto = {
  ref: NcRef
  plan_ref: PlanRef
  origin: string
  parent: NcRef | null
  review_status: string
  files: NcFileDto[]
  reviews: Record<string, unknown>[]
  feedback_id: string | null
  simulation_version: NcRef | null
  comparison_sha256: string | null
  root_run_id: string
  is_current_candidate: boolean
  allowed_actions: string[]
}

function obj(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object`)
  return value as Record<string, unknown>
}
function str(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${path} must be a nonempty string`)
  return value
}
function int(value: unknown, path: string, min = 0): number {
  if (!Number.isInteger(value) || (value as number) < min)
    throw new Error(`${path} must be an integer >= ${min}`)
  return value as number
}
function arr(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value
}
function sha(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value))
    throw new Error(`${path} must be SHA-256`)
  return value
}
function ordered(items: { id: string; sequence: number }[], path: string) {
  const ids = new Set<string>()
  const sequences = new Set<number>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${path} duplicate ID`)
    if (sequences.has(item.sequence)) throw new Error(`${path} duplicate sequence`)
    ids.add(item.id)
    sequences.add(item.sequence)
  }
}
function scalar(value: unknown, path: string) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return
  throw new Error(`${path} must be a finite scalar`)
}
function scalars(value: unknown, path: string) {
  arr(value, path).forEach((entry) => {
    if (entry === null) throw new Error(`${path} contains null`)
    scalar(entry, path)
  })
}

export function parsePlanProduced(value: unknown): PlanProducedDto {
  const plan = obj(value, 'PlanProduced')
  for (const key of [
    'schema_version',
    'provider',
    'event_id',
    'task_id',
    'result_id',
    'run_id',
    'trace_id',
    'source_request_id',
    'trigger_request_id',
  ])
    str(plan[key], key)
  if (plan.provider !== 'template') throw new Error('Unsupported provider')
  if (!['template-plan-v1', 'template-plan-v1-integration'].includes(String(plan.schema_version)))
    throw new Error('Unsupported template profile')
  int(plan.revision, 'revision', 1)
  const feedback = obj(plan.feedback_snapshot, 'feedback_snapshot')
  int(feedback.feedback_version, 'feedback_snapshot.feedback_version')
  arr(feedback.items, 'feedback_snapshot.items')
  const payload = obj(plan.payload, 'payload')
  for (const key of ['part', 'blank', 'resources']) obj(payload[key], `payload.${key}`)
  const ext = obj(payload.extensions, 'payload.extensions')
  const integration = plan.schema_version === 'template-plan-v1-integration'
  if (ext.reference_only !== !integration) throw new Error('profile reference_only mismatch')
  if (ext.execution_ready !== integration) throw new Error('profile execution_ready mismatch')
  if (ext.source_binding !== (integration ? 'integration_pending' : 'source_unbound'))
    throw new Error('profile source_binding mismatch')
  obj(ext.preparation, 'extensions.preparation')
  if (arr(ext.applied_feedback_ids, 'extensions.applied_feedback_ids').length)
    throw new Error('profile applied_feedback_ids must be empty')
  if (integration) {
    if (ext.engineering_status !== 'pending') throw new Error('profile engineering_status mismatch')
    obj(ext.matching_evidence, 'extensions.matching_evidence')
  }
  const template = obj(ext.template, 'extensions.template')
  str(template.id, 'template.id')
  str(template.version, 'template.version')
  sha(template.digest, 'template.digest')
  sha(ext.plan_digest, 'plan_digest')
  const rules =
    ext.parameter_rules === undefined
      ? []
      : arr(ext.parameter_rules, 'parameter_rules').map((raw) => {
          const rule = obj(raw, 'parameter_rules item')
          for (const key of ['path', 'operation_id', 'parameter_id', 'value_type', 'edit_policy'])
            str(rule[key], `rule.${key}`)
          if (rule.unit !== undefined) str(rule.unit, 'rule.unit')
          if (rule.allowed_values !== undefined) scalars(rule.allowed_values, 'rule.allowed_values')
          return rule as ParameterRule
        })
  const operations = arr(payload.operations, 'payload.operations').map((raw) => {
    const op = obj(raw, 'operation')
    str(op.id, 'operation.id')
    int(op.sequence, 'operation.sequence', 1)
    str(op.name, 'operation.name')
    const attrs = obj(op.attributes, 'operation.attributes')
    const steps = arr(op.steps, 'operation.steps').map((rawStep) => {
      const step = obj(rawStep, 'step')
      str(step.id, 'step.id')
      int(step.sequence, 'step.sequence', 1)
      str(step.content, 'step.content')
      obj(step.attributes, 'step.attributes')
      return step as CoreStep
    })
    ordered(steps, `operation ${op.id} steps`)
    if (attrs.parameters !== undefined)
      Object.entries(obj(attrs.parameters, 'parameters')).forEach(([key, v]) =>
        scalar(v, `parameters.${key}`),
      )
    if (attrs.parameter_metadata !== undefined)
      for (const [key, rawMeta] of Object.entries(
        obj(attrs.parameter_metadata, 'parameter_metadata'),
      )) {
        const meta = obj(rawMeta, `parameter_metadata.${key}`)
        str(meta.name, `parameter_metadata.${key}.name`)
        str(meta.edit_policy, `parameter_metadata.${key}.edit_policy`)
        obj(meta.source, `parameter_metadata.${key}.source`)
        if (meta.unit !== undefined) str(meta.unit, `parameter_metadata.${key}.unit`)
        if (meta.allowed_values !== undefined)
          scalars(meta.allowed_values, `parameter_metadata.${key}.allowed_values`)
      }
    if (attrs.source_parameters !== undefined) arr(attrs.source_parameters, 'source_parameters')
    if (attrs.resources !== undefined) arr(attrs.resources, 'resources')
    return op as CoreOperation
  })
  ordered(operations, 'operations')
  for (const rule of rules) {
    const op = operations.find((item) => item.id === rule.operation_id)
    const metadata = op?.attributes.parameter_metadata
    const meta =
      metadata === undefined ? undefined : obj(metadata, 'parameter_metadata')[rule.parameter_id]
    if (meta === undefined) continue
    const item = obj(meta, 'rule metadata')
    if (
      item.unit !== rule.unit ||
      item.edit_policy !== rule.edit_policy ||
      JSON.stringify(item.allowed_values) !== JSON.stringify(rule.allowed_values)
    )
      throw new Error(
        `parameter_rules metadata mismatch for ${rule.operation_id}/${rule.parameter_id}`,
      )
  }
  return plan as PlanProducedDto
}
function ncRef(value: unknown, path: string): NcRef {
  const ref = obj(value, path)
  str(ref.cam_run_id, `${path}.cam_run_id`)
  int(ref.version, `${path}.version`, 1)
  sha(ref.content_digest, `${path}.content_digest`)
  return ref as NcRef
}
export function parseNcVersion(value: unknown): NcVersionDto {
  const version = obj(value, 'NcVersionView')
  ncRef(version.ref, 'ref')
  if (version.parent != null) ncRef(version.parent, 'parent')
  if (version.simulation_version != null) ncRef(version.simulation_version, 'simulation_version')
  const plan = obj(version.plan_ref, 'plan_ref')
  str(plan.task_id, 'plan_ref.task_id')
  str(plan.result_id, 'plan_ref.result_id')
  int(plan.revision, 'plan_ref.revision', 1)
  sha(plan.archive_digest, 'plan_ref.archive_digest')
  if (!['cam_generated', 'human_edit', 'agent_edit'].includes(String(version.origin)))
    throw new Error('origin invalid')
  if (!['pending', 'approved', 'rejected'].includes(String(version.review_status)))
    throw new Error('review_status invalid')
  str(version.root_run_id, 'root_run_id')
  if (typeof version.is_current_candidate !== 'boolean')
    throw new Error('is_current_candidate invalid')
  arr(version.allowed_actions, 'allowed_actions').forEach((v) => str(v, 'allowed_action'))
  arr(version.reviews, 'reviews')
  if (version.feedback_id != null) str(version.feedback_id, 'feedback_id')
  if (version.comparison_sha256 != null) sha(version.comparison_sha256, 'comparison_sha256')
  const files = arr(version.files, 'files').map((raw) => {
    const file = obj(raw, 'file')
    for (const key of ['file_id', 'filename', 'setup_id', 'encoding']) str(file[key], `file.${key}`)
    int(file.sequence, 'file.sequence', 1)
    int(file.size_bytes, 'file.size_bytes')
    sha(file.sha256, 'file.sha256')
    return file as NcFileDto
  })
  ordered(
    files.map((file) => ({ id: file.file_id, sequence: file.sequence })),
    'files',
  )
  return {
    ...version,
    parent: version.parent ?? null,
    simulation_version: version.simulation_version ?? null,
    feedback_id: version.feedback_id ?? null,
    comparison_sha256: version.comparison_sha256 ?? null,
    files: files.slice().sort((a, b) => a.sequence - b.sequence),
  } as NcVersionDto
}

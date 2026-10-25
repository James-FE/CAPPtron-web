import type { LivePlan, Deployment, Metadata } from './contracts'
type PlanProducedDto = Pick<LivePlan, 'payload'>

export type IntegrationTemplate = {
  template: { id: string; version: string; digest: string }
  execution_profile_id: string
  matching_evidence: { step_sha256: string; report_sha256: string; mcam_sha256: string }
  operations: {
    id: string
    sequence: number
    name: string
    steps: { id: string; sequence: number; content: string }[]
    parameter_metadata: Record<string, unknown>
  }[]
  parameter_rules: Record<string, unknown>[]
}
export type IntegrationConfig = {
  schema_version: 'frontend-integration.v1'
  templates: IntegrationTemplate[]
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path}: object required`)
  return value as Record<string, unknown>
}
function text(value: unknown, path: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path}: string required`)
}
function sha(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value))
    throw new Error('SHA-256 required')
}
function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: array required`)
  return value
}
function identified(items: unknown[], path: string) {
  const ids = new Set<string>()
  const sequences = new Set<number>()
  for (const item of items) {
    const data = record(item, path)
    text(data.id, `${path}.id`)
    if (!Number.isSafeInteger(data.sequence) || (data.sequence as number) < 1)
      throw new Error(`${path}: invalid sequence`)
    if (ids.has(data.id as string) || sequences.has(data.sequence as number))
      throw new Error(`${path}: duplicate identity`)
    ids.add(data.id as string)
    sequences.add(data.sequence as number)
  }
}
export function parseIntegrationConfig(value: unknown): IntegrationConfig {
  const root = record(value, 'config')
  if (root.schema_version !== 'frontend-integration.v1')
    throw new Error('Unsupported config schema_version')
  const identities = new Set<string>()
  const templates = list(root.templates, 'templates')
  if (!templates.length) throw new Error('No configured templates')
  for (const raw of templates) {
    const entry = record(raw, 'template entry')
    const template = record(entry.template, 'template')
    text(template.id, 'template.id')
    text(template.version, 'template.version')
    sha(template.digest)
    const key = JSON.stringify([template.id, template.version, template.digest])
    if (identities.has(key)) throw new Error('duplicate template identity')
    identities.add(key)
    text(entry.execution_profile_id, 'execution_profile_id')
    const evidence = record(entry.matching_evidence, 'matching_evidence')
    for (const key of ['step_sha256', 'report_sha256', 'mcam_sha256']) sha(evidence[key])
    const operations = list(entry.operations, 'operations')
    identified(operations, 'operations')
    const stepIds = new Set<string>()
    for (const rawOp of operations) {
      const op = record(rawOp, 'operation')
      text(op.name, 'operation.name')
      record(op.parameter_metadata, 'parameter_metadata')
      const steps = list(op.steps, 'steps')
      identified(steps, 'steps')
      for (const rawStep of steps) {
        const step = record(rawStep, 'step')
        text(step.content, 'step.content')
        if (stepIds.has(step.id as string)) throw new Error('duplicate step identity')
        stepIds.add(step.id as string)
      }
    }
    const ruleKeys = new Set<string>()
    for (const rawRule of list(entry.parameter_rules, 'parameter_rules')) {
      const rule = record(rawRule, 'parameter_rule')
      for (const key of ['path', 'operation_id', 'parameter_id', 'value_type', 'edit_policy'])
        text(rule[key], `rule.${key}`)
      const key = JSON.stringify([rule.operation_id, rule.parameter_id])
      if (ruleKeys.has(key)) throw new Error('duplicate parameter rule')
      ruleKeys.add(key)
      if (!operations.some((op) => record(op, 'op').id === rule.operation_id))
        throw new Error('Unknown rule operation')
      if (
        !['number', 'integer', 'string', 'boolean'].includes(String(rule.value_type)) ||
        !['replace', 'read_only'].includes(String(rule.edit_policy))
      )
        throw new Error('Unsupported parameter rule')
      if (rule.edit_policy === 'replace') {
        text(rule.unit, 'rule.unit')
        if (!list(rule.allowed_values, 'rule.allowed_values').length)
          throw new Error('Empty allowed values')
      }
    }
  }
  return root as IntegrationConfig
}

// 校验部署文件的原始字节，不重新序列化 JSON，避免跨语言数字和空白差异。
export async function loadIntegrationConfig(
  url: string,
  expectedSha256: string,
  fetcher: typeof fetch = fetch,
) {
  sha(expectedSha256)
  const response = await fetcher(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Configuration HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const actual = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  if (actual !== expectedSha256) throw new Error('Configuration digest mismatch')
  const config = parseIntegrationConfig(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  )
  return { config, sha256: actual }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
function ruleShape(value: unknown) {
  return list(value, 'parameter_rules')
    .map((raw) => {
      const rule = record(raw, 'parameter_rule')
      return Object.fromEntries(
        [
          'path',
          'operation_id',
          'parameter_id',
          'value_type',
          'unit',
          'allowed_values',
          'edit_policy',
          'minimum',
          'maximum',
        ].map((key) => [key, rule[key] ?? null]),
      )
    })
    .sort((a, b) => String(a.path).localeCompare(String(b.path)))
}
function operationShape(
  operations: IntegrationTemplate['operations'] | PlanProducedDto['payload']['operations'],
) {
  return operations
    .map((op) => ({
      id: op.id,
      sequence: op.sequence,
      steps: op.steps
        .map((step) => ({ id: step.id, sequence: step.sequence }))
        .sort((a, b) => a.sequence - b.sequence),
    }))
    .sort((a, b) => a.sequence - b.sequence)
}

// 返回的配置只决定展示与一致性；CAM 资格必须继续查询后端 approved-plans。
export function matchIntegrationTemplate(
  config: IntegrationConfig,
  plan: PlanProducedDto,
): IntegrationTemplate {
  const ext = plan.payload.extensions
  const identity = record(ext.template, 'plan.template')
  const matches = config.templates.filter((entry) =>
    ['id', 'version', 'digest'].every(
      (key) => entry.template[key as keyof IntegrationTemplate['template']] === identity[key],
    ),
  )
  if (matches.length !== 1) throw new Error('Configuration template mismatch')
  const entry = matches[0]!
  const evidence = record(ext.matching_evidence, 'plan.matching_evidence')
  for (const key of ['step_sha256', 'report_sha256', 'mcam_sha256'] as const) {
    if (entry.matching_evidence[key] !== evidence[key])
      throw new Error(`Configuration ${key} mismatch`)
  }
  if (
    canonical(operationShape(entry.operations)) !==
    canonical(operationShape(plan.payload.operations))
  )
    throw new Error('Configuration operations mismatch')
  for (const operation of plan.payload.operations) {
    const configured = entry.operations.find((op) => op.id === operation.id)!
    if (
      canonical(configured.parameter_metadata) !==
      canonical(operation.attributes.parameter_metadata ?? {})
    )
      throw new Error('Configuration parameter_metadata mismatch')
  }
  if (canonical(ruleShape(entry.parameter_rules)) !== canonical(ruleShape(ext.parameter_rules)))
    throw new Error('Configuration parameter_rules mismatch')
  return entry
}

// 由受控描述符投影旧 Hook 所需字段，避免部署第二份配置。
export function deploymentFromTemplate(entry: IntegrationTemplate, source: string): Deployment {
  const digests = new Set<string>()
  for (const operation of entry.operations) {
    for (const raw of Object.values(operation.parameter_metadata)) {
      const metadata = raw as Metadata
      if (metadata.source?.sha256) digests.add(metadata.source.sha256)
    }
  }
  if (digests.size > 1) throw new Error('Configuration parameter metadata source mismatch')
  return {
    schema_version: 'golden-deployment-v1',
    source,
    template: entry.template,
    execution_profile_digest: [...digests][0] ?? '',
    engineering_binding_configured: true,
  }
}

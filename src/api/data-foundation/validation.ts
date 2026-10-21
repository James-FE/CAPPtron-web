import Ajv from 'ajv'
import schema from './schema/foundation-dataset.schema.json'
import { assetDetails } from './assets'
import { machineOperations, manufacturingOperations, toolOperations } from './compatibility'
import { FoundationError, type FoundationIssue } from './reader'
import { isTimestamp, isTimeZone } from './time'
import type { FoundationDataset, ResourceBase } from './types'

const ajv = new Ajv({ allErrors: true, strict: true })
ajv.addFormat('foundation-timestamp', isTimestamp)
ajv.addFormat('foundation-timezone', isTimeZone)
const check = ajv.compile<FoundationDataset>(schema)

// 在 Ajv 前检查 JSON 可表示性，防止 undefined/NaN/稀疏数组被序列化时悄悄丢失。
function checkJson(value: unknown, path = '', ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (
    typeof value !== 'object' ||
    ancestors.has(value) ||
    (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
  ) {
    throw new FoundationError('invalid_data', '数据必须可无损表示为 JSON', [
      { path, message: '非法 JSON 值或循环引用' },
    ])
  }
  ancestors.add(value)
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) checkJson(value[i], `${path}/${i}`, ancestors)
  } else {
    for (const [key, item] of Object.entries(value)) checkJson(item, `${path}/${key}`, ancestors)
  }
  ancestors.delete(value)
}

export function validateFoundationDataset(value: unknown): FoundationDataset {
  checkJson(value)
  if (
    value &&
    typeof value === 'object' &&
    'schemaVersion' in value &&
    typeof value.schemaVersion === 'string' &&
    value.schemaVersion !== '1.0'
  ) {
    throw new FoundationError('contract_incompatible', '不支持的数据底座 Schema 版本', [
      { path: '/schemaVersion', message: `不支持 ${value.schemaVersion}` },
    ])
  }
  if (!check(value)) {
    throw new FoundationError(
      'invalid_data',
      '数据底座结构校验失败',
      (check.errors ?? []).map((error) => ({
        path:
          error.instancePath +
          (error.keyword === 'required'
            ? `/${error.params.missingProperty}`
            : error.keyword === 'additionalProperties'
              ? `/${error.params.additionalProperty}`
              : ''),
        message: error.message ?? error.keyword,
      })),
    )
  }
  const issues: FoundationIssue[] = []
  const issue = (path: string, message: string) => issues.push({ path, message })
  const details = assetDetails(value)
  const resources = new Map<string, ResourceBase>()
  for (const { kind, asset } of details) {
    const key = `${kind}/${asset.id}`
    if (resources.has(key)) issue(key, '重复资源 ID')
    resources.set(key, asset)
    if (Date.parse(asset.createdAt) > Date.parse(value.asOf))
      issue(`${key}/createdAt`, '登记时间晚于快照')
    if (asset.provenance.dataMode !== value.dataMode)
      issue(`${key}/provenance`, '来源模式与数据集不一致')
  }
  const reference = (kind: string, id: string, path: string) => {
    const found = resources.get(`${kind}/${id}`)
    if (!found) issue(path, `悬空引用 ${kind}/${id}`)
    return found
  }
  const machines = new Map(value.machines.map((item) => [item.id, item]))
  const tools = new Map(value.tools.map((item) => [item.id, item]))
  const knowledge = new Map(value.knowledge.map((item) => [item.id, item]))
  const parts = new Map(value.parts.map((item) => [item.id, item]))
  const models = new Map(value.models.map((item) => [item.id, item]))
  for (const machine of value.machines) {
    if (
      machine.supportedOperations.some(
        (method) => !machineOperations[machine.machineType].includes(method),
      )
    )
      issue(`machine/${machine.id}/supportedOperations`, '加工方式与机床分类冲突')
  }
  for (const tool of value.tools) {
    if (tool.supportedOperations.some((method) => !toolOperations[tool.toolType].includes(method)))
      issue(`tool/${tool.id}/supportedOperations`, '加工方式与刀具分类冲突')
    for (const machineType of tool.compatibleMachineTypes)
      if (
        !tool.supportedOperations.some((method) => machineOperations[machineType].includes(method))
      )
        issue(`tool/${tool.id}/compatibleMachineTypes`, `与 ${machineType} 无共同声明加工方式`)
  }
  for (const plan of value.processPlans) {
    const scope = `process_plan/${plan.id}`
    const part = reference('part', plan.partId, `${scope}/partId`)
    if (part && Date.parse(part.createdAt) > Date.parse(plan.createdAt))
      issue(`${scope}/createdAt`, '方案早于零件登记')
    const operationIds = new Set<string>()
    const sequences = new Set<number>()
    for (const operation of plan.operations) {
      const path = `${scope}/operations/${operation.id}`
      if (operationIds.has(operation.id)) issue(`${path}/id`, '方案内工序 ID 重复')
      if (sequences.has(operation.sequence)) issue(`${path}/sequence`, '方案内工序序号重复')
      operationIds.add(operation.id)
      sequences.add(operation.sequence)
      if (!manufacturingOperations[plan.manufacturingType].includes(operation.method))
        issue(`${path}/method`, '工序与方案加工分类冲突')
      const machine = operation.machineId ? machines.get(operation.machineId) : undefined
      if (operation.machineId) reference('machine', operation.machineId, `${path}/machineId`)
      if (machine && !machine.supportedOperations.includes(operation.method))
        issue(`${path}/machineId`, '机床未声明支持该加工方式')
      for (const id of operation.toolIds) {
        reference('tool', id, `${path}/toolIds`)
        const tool = tools.get(id)
        if (
          tool &&
          (!tool.supportedOperations.includes(operation.method) ||
            (machine && !tool.compatibleMachineTypes.includes(machine.machineType)))
        )
          issue(`${path}/toolIds/${id}`, '刀具声明与工序或机床类型冲突')
      }
      for (const id of operation.knowledgeIds) {
        reference('knowledge', id, `${path}/knowledgeIds`)
        const item = knowledge.get(id)
        const linkedPart = parts.get(plan.partId)
        if (item) {
          const applicability = item.applicability
          if (
            (applicability.operations.length &&
              !applicability.operations.includes(operation.method)) ||
            (linkedPart &&
              applicability.partCategories.length &&
              !applicability.partCategories.includes(linkedPart.category)) ||
            (linkedPart &&
              applicability.materials.length &&
              !applicability.materials.includes(linkedPart.material))
          )
            issue(`${path}/knowledgeIds/${id}`, '知识适用条件与工序或零件冲突')
        }
      }
    }
  }
  for (const item of value.knowledge)
    for (const ref of item.relatedAssets)
      reference(ref.kind, ref.id, `knowledge/${item.id}/relatedAssets`)
  for (const model of value.models)
    if (
      model.provenance.dataMode === 'synthetic_demo' &&
      model.integrationStatus !== 'not_connected'
    )
      issue(`model/${model.id}/integrationStatus`, '模拟登记只能声明未接入')
  const eventIds = new Set<string>()
  for (const event of value.usageEvents) {
    const path = `usageEvents/${event.id}`
    if (eventIds.has(event.id)) issue(`${path}/id`, '事件 ID 重复')
    eventIds.add(event.id)
    const target =
      event.type === 'knowledge_referenced'
        ? reference('knowledge', event.knowledgeId, `${path}/knowledgeId`)
        : reference('model', event.modelId, `${path}/modelId`)
    if (event.provenance.dataMode !== value.dataMode)
      issue(`${path}/provenance`, '事件来源与数据集不一致')
    if (
      Date.parse(event.occurredAt) > Date.parse(value.asOf) ||
      (target && Date.parse(event.occurredAt) < Date.parse(target.createdAt))
    )
      issue(`${path}/occurredAt`, '事件必须位于目标登记时间与快照时间之间')
    if (
      event.type === 'model_invoked' &&
      event.task &&
      models.has(event.modelId) &&
      !models.get(event.modelId)!.supportedTasks.includes(event.task)
    )
      issue(`${path}/task`, '模型未声明支持该任务')
  }
  if (issues.length)
    throw new FoundationError('data_integrity', '数据底座关系或来源校验失败', issues)
  return value
}

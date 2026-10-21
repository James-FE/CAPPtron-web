import { machineOperations, toolOperations } from '../compatibility'
import { FoundationError } from '../reader'
import { isBusinessDate } from '../time'
import {
  knowledgeCategories,
  knowledgeTopics,
  modelTypes,
  type FoundationDataset,
  type KnowledgeTopic,
  type OperationMethod,
  type PartCategory,
  type Provenance,
  type ResourceBase,
  type SupportedTask,
  type ToolType,
} from '../types'
import { validateFoundationDataset } from '../validation'
import { mockDatasetVersion, mockTimeZone, type FoundationMockConfig } from './mockConfig'

// FNV-1a 身份由 seed + 语义键决定；集合重排不会把数组位置变成身份。
function hash(text: string): number {
  let result = 2166136261
  for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619)
  return result >>> 0
}
function randomGenerator(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let result = Math.imul(state ^ (state >>> 15), 1 | state)
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}
const materials = ['45钢', '40Cr', '6061铝合金', '304不锈钢'] as const
// 当前演示只覆盖回转体车削；钻孔、镗孔、切断均为车床内的工序。
type TurningMethod = Extract<OperationMethod, 'turning' | 'drilling' | 'boring' | 'parting'>
const categories: {
  category: Extract<PartCategory, 'shaft' | 'ring' | 'disc'>
  label: string
  names: string[]
  features: string[]
  methods: TurningMethod[]
}[] = [
  {
    category: 'shaft',
    label: '轴类',
    names: ['传动轴', '阶梯轴', '定位销轴', '联接轴', '支承轴', '导向轴', '辊轴', '芯轴'],
    features: ['外圆', '轴肩', '中心孔'],
    methods: ['turning', 'drilling', 'parting'],
  },
  {
    category: 'ring',
    label: '环套类',
    names: ['间隔环', '轴承套环', '密封支承环', '挡环', '定位套环', '隔套', '衬套', '导向套'],
    features: ['内孔', '外圆', '端面'],
    methods: ['turning', 'boring', 'parting'],
  },
  {
    category: 'disc',
    label: '回转盘类',
    names: [
      '圆盘毛坯',
      '支承盘',
      '压盘',
      '定位盘',
      '端面挡盘',
      '圆形垫盘',
      '轮毂盘毛坯',
      '法兰盘毛坯',
    ],
    features: ['端面', '外圆', '轴向中心通孔'],
    methods: ['turning', 'drilling', 'boring'],
  },
]
const methodLabels: Record<TurningMethod, string> = {
  turning: '外圆与端面车削',
  drilling: '车床轴向钻孔',
  boring: '车床内孔镗削',
  parting: '车床切断',
}
// 通用 turning 枚举也允许内孔车刀；本模板的 turning 工序明确加工外圆与端面。
const toolTypesByMethod: Record<TurningMethod, readonly ToolType[]> = {
  turning: ['external_turning'],
  drilling: ['drill'],
  boring: ['internal_turning', 'boring_bar'],
  parting: ['parting'],
}
const topicText: Record<KnowledgeTopic, { label: string; content: string }> = {
  process_rules: {
    label: '工序安排',
    content:
      '外圆、端面与内孔的粗精车顺序应结合余量、变形和测量条件安排；调头装夹后需重新核对基准。',
  },
  material: {
    label: '材料注意事项',
    content: '材料牌号与热处理状态共同影响切削行为，需核对毛坯状态、排屑条件与冷却方案。',
  },
  tool_selection: {
    label: '刀具选择',
    content: '车刀需结合刀尖可达性、刀杆悬伸、刃口形状和排屑空间选择，不能仅由刀具名称确认适配。',
  },
  fixturing: {
    label: '装夹定位',
    content:
      '车床卡盘夹持面、伸出长度与回转区域需要共同核查；薄壁环套或细长轴应评估夹紧变形与支承条件。',
  },
  parameters: {
    label: '参数选择条件',
    content: '转速、进给与切深须结合刀具资料、材料状态、刚性与试切结果确定；本条不提供生产设定值。',
  },
  quality: {
    label: '质量排查',
    content:
      '尺寸漂移与表面异常需分别排查刀具磨损、装夹、热变形及测量基准，不能直接归因于单个参数。',
  },
}
const materialNotes: Record<(typeof materials)[number], string> = {
  '45钢': '关注热处理状态与粗精加工之间的变形。',
  '40Cr': '调质与未调质状态需分别评价，不以牌号代替硬度资料。',
  '6061铝合金': '关注积屑、毛刺与薄壁夹紧变形。',
  '304不锈钢': '关注加工硬化与排屑条件。',
}
const turningTools: {
  type: Extract<
    ToolType,
    'external_turning' | 'internal_turning' | 'parting' | 'drill' | 'boring_bar'
  >
  label: string
}[] = [
  { type: 'external_turning', label: '外圆车刀' },
  { type: 'internal_turning', label: '内孔车刀' },
  { type: 'parting', label: '切断刀' },
  { type: 'drill', label: '车床轴向钻头' },
  { type: 'boring_bar', label: '车床镗刀' },
]
const toolSizes = [4, 6, 8, 10, 12, 16, 20, 25]

export function generateFoundationMock(config: FoundationMockConfig): FoundationDataset {
  if (
    !config ||
    !Number.isSafeInteger(config.seed) ||
    config.seed < 0 ||
    config.seed > 0xffffffff ||
    typeof config.asOfDate !== 'string' ||
    !isBusinessDate(config.asOfDate) ||
    config.asOfDate < '1901-01-01'
  ) {
    throw new FoundationError(
      'invalid_query',
      'Mock 需要 uint32 seed 和不早于 1901-01-01 的有效基准日期',
    )
  }
  const random = randomGenerator(config.seed)
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)]
    if (item === undefined) throw new FoundationError('data_integrity', '生成模板缺少可用关联')
    return item
  }
  const id = (kind: string, key: string) =>
    `${kind}-${hash(`${config.seed}:${kind}:${key}`).toString(16).padStart(8, '0')}`
  const asOf = new Date(`${config.asOfDate}T23:59:59.999+08:00`).toISOString()
  const end = Date.parse(asOf)
  const day = 86400000
  const provenance = (): Provenance => ({ dataMode: 'synthetic_demo', source: mockDatasetVersion })
  const base = (kind: string, key: string, age: number): ResourceBase => ({
    id: id(kind, key),
    createdAt: new Date(end - age * day - Math.floor(random() * (day - 1))).toISOString(),
    provenance: provenance(),
  })
  const dataset: FoundationDataset = {
    schemaVersion: '1.0',
    datasetVersion: `${mockDatasetVersion}:${config.seed}:${config.asOfDate}`,
    dataMode: 'synthetic_demo',
    asOf,
    timeZone: mockTimeZone,
    parts: [],
    processPlans: [],
    machines: [],
    tools: [],
    knowledge: [],
    models: [],
    usageEvents: [],
  }
  for (const cell of ['A', 'B', 'C']) {
    dataset.machines.push({
      ...base('machine', `cnc_lathe:${cell}`, 20 + Math.floor(random() * 40)),
      name: `演示数控车床 ${cell}`,
      machineType: 'cnc_lathe',
      capabilities: {
        axisCount: 2,
        maxSpindleSpeed: { value: pick([4000, 6000]), unit: 'r/min' },
      },
      supportedOperations: [...machineOperations.cnc_lathe],
    })
  }
  for (const { type, label } of turningTools) {
    for (const size of toolSizes) {
      const methods = [...toolOperations[type]]
      dataset.tools.push({
        ...base('tool', `${type}:${size}`, Math.floor(random() * 24)),
        name: `演示${label} ${size} mm`,
        toolType: type,
        specification: {
          description:
            type === 'drill'
              ? '合成直径规格；未核对实物、刀柄和加工适配。'
              : `合成刀杆名义规格 ${size} mm；未核对刀片与装配。`,
          ...(type === 'drill' ? { diameter: { value: size, unit: 'mm' as const } } : {}),
        },
        supportedOperations: methods,
        compatibleMachineTypes: ['cnc_lathe'],
      })
    }
  }
  for (const group of categories) {
    for (const topic of knowledgeTopics) {
      for (const material of materials) {
        const definition = topicText[topic]
        const tool = pick(
          dataset.tools.filter((item) =>
            group.methods.some(
              (method) =>
                item.supportedOperations.includes(method) &&
                toolTypesByMethod[method].includes(item.toolType),
            ),
          ),
        )
        dataset.knowledge.push({
          ...base('knowledge', `${group.category}:${topic}:${material}`, Math.floor(random() * 21)),
          title: `${material} · ${group.label}车削 · ${definition.label}`,
          content: `车削合成知识示例：${definition.content}${materialNotes[material]}关注特征：${group.features.join('、')}。仅用于目录和统计演示，未经工程确认。`,
          topic,
          knowledgeCategory: pick(knowledgeCategories),
          applicability: {
            operations: [...group.methods],
            partCategories: [group.category],
            materials: [material],
          },
          relatedAssets: [{ kind: 'tool', id: tool.id }],
        })
      }
    }
  }
  for (const group of categories) {
    for (const name of group.names) {
      const material = pick(materials)
      dataset.parts.push({
        ...base('part', name, Math.floor(random() * 28)),
        name: `演示${name}`,
        category: group.category,
        material,
        features: [...group.features],
        description: `${name}的合成资源登记，材料为${material}，仅描述${group.label}的回转体车削阶段（含车床轴向孔加工或切断）；无真实 CAD 或检验记录，不包含后续非车削特征。`,
      })
    }
  }
  const assignments = [
    ...dataset.parts.map((part) => ({ part, variant: 'primary' })),
    ...dataset.parts.slice(0, 8).map((part) => ({ part, variant: 'alternative' })),
  ]
  for (const { part, variant } of assignments) {
    const group = categories.find((item) => item.category === part.category)!
    const planId = id('plan', `${part.id}:${variant}`)
    const operations = group.methods.map((method, position) => {
      const machine = pick(
        dataset.machines.filter((item) => item.supportedOperations.includes(method)),
      )
      const tool = pick(
        dataset.tools.filter(
          (item) =>
            item.supportedOperations.includes(method) &&
            toolTypesByMethod[method].includes(item.toolType) &&
            item.compatibleMachineTypes.includes(machine.machineType),
        ),
      )
      const knowledge = pick(
        dataset.knowledge.filter(
          (item) =>
            item.applicability.operations.includes(method) &&
            item.applicability.partCategories.includes(part.category) &&
            item.applicability.materials.includes(part.material),
        ),
      )
      const incomplete = variant === 'alternative' && position === 0
      return {
        id: id('operation', `${planId}:${method}`),
        sequence: (position + 1) * 10,
        name: `${group.label}${methodLabels[method]}（演示）`,
        method,
        ...(!incomplete ? { machineId: machine.id } : {}),
        toolIds: incomplete ? [] : [tool.id],
        knowledgeIds: [knowledge.id],
      }
    })
    const references = operations.flatMap((operation) => [
      ...dataset.machines.filter((item) => item.id === operation.machineId),
      ...dataset.tools.filter((item) => operation.toolIds.includes(item.id)),
      ...dataset.knowledge.filter((item) => operation.knowledgeIds.includes(item.id)),
    ])
    const earliest = Math.max(
      Date.parse(part.createdAt),
      ...references.map((item) => Date.parse(item.createdAt)),
    )
    dataset.processPlans.push({
      id: planId,
      name: `${part.name} · ${variant === 'primary' ? '基础工艺' : '备选工艺'}`,
      partId: part.id,
      version: 'v1',
      manufacturingType: 'turning',
      operations,
      createdAt: new Date(earliest + Math.floor(random() * (end - earliest))).toISOString(),
      provenance: provenance(),
    })
    const linked = dataset.knowledge.find((item) => item.id === operations[0]?.knowledgeIds[0])
    if (linked) {
      linked.relatedAssets.push({ kind: 'process_plan', id: planId })
      if (!linked.relatedAssets.some((ref) => ref.kind === 'part' && ref.id === part.id))
        linked.relatedAssets.push({ kind: 'part', id: part.id })
    }
  }
  const tasks: SupportedTask[][] = [
    ['knowledge_retrieval', 'process_planning'],
    ['resource_matching', 'knowledge_retrieval'],
    ['feature_recognition'],
    ['process_planning'],
    ['parameter_recommendation'],
    ['engineering_calculation'],
  ]
  for (const [index, type] of modelTypes.entries()) {
    dataset.models.push({
      ...base('model', type, 30 + index),
      name: `演示车削场景能力登记 · ${type}`,
      modelType: type,
      supportedTasks: tasks[index]!,
      integrationStatus: 'not_connected',
      version: 'demo-v1',
    })
  }
  // 两类事件分开构造；发生时间不早于目标登记，且绝不晚于快照。
  for (let i = 0; i < 240; i++) {
    const isKnowledge = i < 180
    const target = isKnowledge
      ? pick(i % 3 === 0 ? dataset.knowledge.slice(0, 12) : dataset.knowledge)
      : pick(dataset.models)
    const start = Math.max(Date.parse(target.createdAt), end - 14 * day)
    const common = {
      id: id('event', `${isKnowledge ? 'knowledge' : 'model'}:sample-${i + 1}`),
      occurredAt: new Date(start + Math.floor(random() * (end - start))).toISOString(),
      scenario: '车削合成业务流程统计演示',
      provenance: provenance(),
    }
    dataset.usageEvents.push(
      isKnowledge
        ? { ...common, type: 'knowledge_referenced', knowledgeId: target.id }
        : { ...common, type: 'model_invoked', modelId: target.id },
    )
  }
  return validateFoundationDataset(dataset)
}

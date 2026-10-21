import type {
  AssetKind,
  KnowledgeCategory,
  ModelType,
  IntegrationStatus,
  SupportedTask,
} from '../../api/data-foundation/types'

export const assetLabels: Record<AssetKind, string> = {
  part: '零件库',
  process_plan: '工艺库',
  machine: '机床库',
  tool: '刀具库',
  knowledge: '知识库',
  model: '模型库',
}
export const knowledgeLabels: Record<KnowledgeCategory, string> = {
  industry: '行业知识',
  institute: '所内知识',
  experience: '经验知识',
}
export const modelLabels: Record<ModelType, string> = {
  general_llm: '通用大语言模型',
  domain_model: '领域模型',
  feature_recognition: '几何特征识别',
  process_planning: '工艺规划算法',
  parameter_recommendation: '参数推荐算法',
  engineering_calculation: '专业计算模型',
}
export const integrationLabels: Record<IntegrationStatus, string> = {
  not_connected: '未接入',
  configured: '已配置',
  available: '可用',
  unavailable: '不可用',
}
export const taskLabels: Record<SupportedTask, string> = {
  process_planning: '工艺规划',
  parameter_recommendation: '参数推荐',
  feature_recognition: '特征识别',
  knowledge_retrieval: '知识检索',
  resource_matching: '资源匹配',
  engineering_calculation: '专业计算',
}
export const enumLabels: Record<string, string> = {
  shaft: '轴类',
  ring: '环套类',
  disc: '盘类',
  plate: '板类',
  housing: '壳体类',
  turning: '车削',
  milling: '铣削',
  drilling: '钻削',
  boring: '镗削',
  parting: '切断',
  turn_mill: '车铣复合',
  mixed: '混合',
  cnc_lathe: '数控车床',
  vertical_machining_center: '立式加工中心',
  cnc_mill: '数控铣床',
  drill: '钻削',
  external_turning: '外圆车刀',
  internal_turning: '内孔车刀',
  end_mill: '立铣刀',
  boring_bar: '镗刀',
  process_rules: '工艺规则',
  material: '材料',
  tool_selection: '刀具选择',
  fixturing: '装夹定位',
  parameters: '参数条件',
  quality: '工艺质量',
}
export const number = (value: number) => value.toLocaleString('zh-CN')
export function timestamp(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
}

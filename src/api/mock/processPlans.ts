import type {
  Parameter,
  ProcessOperation,
  ProcessPlan,
} from '../../features/process-planning/processPlan'

export type DemoPlanId = 'ring' | 'simple' | 'complex' | 'incomplete' | 'empty'

export const demoPlanOptions: { id: DemoPlanId; label: string }[] = [
  { id: 'ring', label: 'Ring_A · 环件示例' },
  { id: 'simple', label: '简单案例 · 支架' },
  { id: 'complex', label: '复杂案例 · 壳体' },
  { id: 'incomplete', label: '不完整案例 · 毛坯' },
  { id: 'empty', label: '零工序案例' },
]

function parameter(id: string, name: string, value: number | null, unit: string): Parameter {
  return {
    id,
    name,
    value,
    unit,
    source: 'mock',
    status: value === null ? 'missing' : 'pending',
    editable: false,
    required: value === null,
    inputKind: 'number',
  }
}

function operation(id: string, sequence: number, name: string, stepCount = 2): ProcessOperation {
  return {
    id,
    sequence,
    name,
    source: 'Mock · 预设演示工艺模板',
    setup: '演示装夹说明：基准面定位；实际夹具及定位方式待工艺人员确认。',
    notes: '本方案只用于检验界面与交互，未经机加工专家确认，不可用于制造。',
    steps: Array.from({ length: stepCount }, (_, index) => ({
      id: `${id}-step-${index + 1}`,
      sequence: index + 1,
      name: index % 2 === 0 ? '基准区域加工（演示）' : '局部轮廓加工（演示）',
      description:
        '依据预设模板展示加工内容、定位说明与参数来源。实际加工顺序、余量和适用性均待确认。',
      parameters: [parameter('allowance', '预留余量', 0.5, 'mm')],
    })),
    parameters: [
      parameter('speed', '主轴转速', 1200, 'r/min'),
      parameter('feed', '进给速度', 160, 'mm/min'),
    ],
    resources: [
      { id: `${id}-machine`, name: '演示加工中心', kind: 'machine', status: 'demo' },
      {
        id: `${id}-tool`,
        name: '演示立铣刀',
        kind: 'tool',
        description: '规格及可用库存待核实',
        status: 'pending',
      },
    ],
    onsiteMeasurements: [
      {
        ...parameter('stock-height', '毛坯实测高度', null, 'mm'),
        editable: true,
        required: true,
        source: 'unknown',
      },
      {
        id: 'constraint',
        name: '现场约束说明',
        value: null,
        source: 'unknown',
        status: 'missing',
        editable: true,
        required: true,
        inputKind: 'text',
      },
    ],
  }
}

function createOperations(id: DemoPlanId): ProcessOperation[] {
  if (id === 'ring') return createRingOperations()
  if (id === 'empty') return []
  if (id === 'incomplete')
    return [
      {
        id: 'blank-inspection',
        sequence: 10,
        name: '毛坯检验',
        source: 'Mock · 不完整上游方案',
        steps: [],
        parameters: [{ ...parameter('dimension', '待补充尺寸', null, 'mm'), required: true }],
        resources: [],
        onsiteMeasurements: [],
      },
    ]
  if (id === 'complex')
    return Array.from({ length: 20 }, (_, index) => {
      const item = operation(
        `housing-operation-${index + 1}`,
        (index + 1) * 10,
        `壳体区域 ${index + 1} · 多基准定位与长轮廓分段加工演示`,
        2 + (index % 7),
      )
      item.parameters.push(
        ...Array.from({ length: 12 }, (_, parameterIndex) =>
          parameter(
            `inspection-${parameterIndex}`,
            `区域 ${parameterIndex + 1} 待确认尺寸`,
            null,
            'mm',
          ),
        ),
      )
      return item
    })
  return [
    operation('bracket-reference', 10, '基准面加工'),
    operation('bracket-profile', 20, '轮廓与孔加工', 3),
    {
      id: 'bracket-inspection',
      sequence: 30,
      name: '成品检验',
      source: 'Mock · 预设检验模板',
      steps: [
        {
          id: 'inspect-dimensions',
          sequence: 1,
          name: '尺寸检验',
          description: '检验项目为演示，不表示检验已执行。',
          parameters: [],
        },
      ],
      parameters: [],
      resources: [],
      onsiteMeasurements: [],
    },
  ]
}

// 每次显式加载返回独立对象；不接收 File，也不推断本地模型对应的工艺。
export function loadDemoPlan(id: DemoPlanId): ProcessPlan {
  const option = demoPlanOptions.find((item) => item.id === id)
  if (!option) throw new Error('未知的演示方案')
  return {
    id: `demo-${id}`,
    name: option.label,
    partName:
      id === 'ring'
        ? 'Ring_A.step'
        : id === 'complex'
          ? '演示壳体'
          : id === 'simple'
            ? '演示支架'
            : '演示毛坯',
    origin: 'mock',
    sourceDescription: '预设 Mock 数据 · 未关联本地 STEP 文件 · 未经制造校核',
    operations: createOperations(id),
    initialOperationId: id === 'ring' ? 'ring-finish-exterior' : undefined,
  }
}

// 环件是独立的具名 Fixture；通用工作台不按名称、工序数量或显示序号分支。
function createRingOperations(): ProcessOperation[] {
  const definitions: [string, string][] = [
    ['ring-rough', '粗车'],
    ['ring-rough-spheres', '粗车内外球面'],
    ['ring-heat-treatment', '热处理'],
    ['ring-reference', '车基准'],
    ['ring-semi-exterior', '半精车外'],
    ['ring-finish-interior', '半精车、精车内'],
    ['ring-inspect-intermediate', '精测'],
    ['ring-finish-exterior', '精车外'],
    ['ring-inspect-final', '精测'],
  ]
  return definitions.map(([id, name], index) => {
    const item = operation(id, index + 1, name, 1)
    item.steps = [
      {
        id: `${id}-content`,
        sequence: 1,
        name: `${name}（演示内容）`,
        description: '预设演示步骤，实际工艺内容及适用性待上游提供。',
        parameters: [],
      },
    ]
    item.parameters = []
    item.resources = []
    item.onsiteMeasurements = []
    if (id === 'ring-finish-exterior') {
      item.setup = '按内止口配车吸具止口，以内止口及止口底面定位。（Figma 示例，未校核）'
      item.steps = ['精车法兰外圆', '精车外型面及法兰背面', '锐边倒钝，去毛刺', '保留编号'].map(
        (stepName, stepIndex) => ({
          id: `${id}-step-${stepIndex + 1}`,
          sequence: stepIndex + 1,
          name: stepName,
          parameters: [],
        }),
      )
      item.parameters = [
        parameter('speed', '主轴转速', 1200, 'r/min'),
        parameter('feed', '每转进给', 0.18, 'mm/r'),
        parameter('depth', '切深', 0.3, 'mm'),
      ]
      item.resources = [
        { id: 'ring-machine', kind: 'machine', name: '机床 M-002 · Demo', status: 'demo' },
        { id: 'ring-tool', kind: 'tool', name: '刀具 T-003 · Demo', status: 'demo' },
      ]
      const fields: [string, string, string, 'number' | 'text'][] = [
        ['sphere-radius', '外球面半径', 'mm', 'number'],
        ['recess-depth', '内止口深度', 'mm', 'number'],
        ['work-offset', '工件零点 / 偏置', '', 'text'],
        ['part-length', '零件实际长度', 'mm', 'number'],
        ['tolerance', '尺寸公差', '', 'text'],
        ['allowance', '加工余量', 'mm', 'number'],
        ['fixture', '定位基准 / 装夹', '', 'text'],
      ]
      item.onsiteMeasurements = fields.map(([fieldId, fieldName, unit, inputKind]) => ({
        id: fieldId,
        name: fieldName,
        value: null,
        unit,
        inputKind,
        editable: true,
        required: true,
        source: 'unknown',
        status: 'missing',
      }))
    }
    return item
  })
}

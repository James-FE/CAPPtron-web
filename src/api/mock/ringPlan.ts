import type {
  Parameter,
  ProcessOperation,
  ProcessPlan,
} from '../../features/process-planning/processPlan'

// 只读资料对应关系及哈希见 FE-002-RING-SOURCE.md；此 Fixture 不执行或输出 NC。
function recorded(id: string, name: string, value: number, unit: string): Parameter {
  return {
    id,
    name,
    value,
    unit,
    source: 'template',
    status: 'provided',
    editable: false,
    inputKind: 'number',
    description: 'Golden-B7 NC 离线记录 · 仅供 Demo 展示',
  }
}

function onsite(id: string, name: string, description: string, unit?: string): Parameter {
  return {
    id,
    name,
    description,
    unit,
    value: null,
    source: 'unknown',
    status: 'missing',
    editable: true,
    required: true,
    inputKind: unit ? 'number' : 'text',
  }
}

export function createRingPlan(): ProcessPlan {
  const definitions: {
    id: string
    name: string
    tool: number
    speed: number
    feed: number
    steps: [string, string][]
  }[] = [
    {
      id: 'ring-facing',
      name: '端面车削',
      tool: 1,
      speed: 295,
      feed: 0.3,
      steps: [
        ['face', '按基线端面刀路车削前端面；基线保留前端 +0.1 mm，不作为现场零点已确认的依据。'],
      ],
    },
    {
      id: 'ring-rough-od',
      name: '外圆粗车',
      tool: 1,
      speed: 295,
      feed: 0.3,
      steps: [
        ['rough-od', '按基线外圆轮廓分层粗车，为后续外圆精车保留余量；具体留量以原工程为准。'],
      ],
    },
    {
      id: 'ring-finish-od',
      name: '外圆精车',
      tool: 1,
      speed: 295,
      feed: 0.3,
      steps: [['finish-od', '按基线外圆精车轮廓加工，参考成品外径为 41 mm。']],
    },
    {
      id: 'ring-rough-id',
      name: '内孔粗车',
      tool: 2,
      speed: 330,
      feed: 0.1,
      steps: [['rough-id', '在基线预孔条件下粗车内孔，为后续内孔精车保留余量；不是钻孔工序。']],
    },
    {
      id: 'ring-finish-id',
      name: '内孔精车',
      tool: 2,
      speed: 330,
      feed: 0.1,
      steps: [['finish-id', '按基线内孔精车轮廓加工，参考成品内径为 39 mm。']],
    },
    {
      id: 'ring-cutoff',
      name: '切断',
      tool: 4,
      speed: 115,
      feed: 0.1,
      steps: [
        ['precut', '预切至基线 NC X39.5，保留连接料。'],
        ['retract', '按基线刀路退刀。'],
        ['chamfer', '在最终分离前完成倒角处理。'],
        ['separate', '最终切至基线 NC X37.9，分离环件；X 为直径坐标。'],
      ],
    },
  ]
  const tools: Record<number, string> = {
    1: 'T0101 · VNMG 16 04 08',
    2: 'T0202 · CCMT 09 T3 04',
    4: 'T0404 · N151.2-185-20-5G',
  }
  const operations: ProcessOperation[] = definitions.map((item, index) => ({
    id: item.id,
    sequence: index + 1,
    name: item.name,
    source: 'Golden-B7 基线离线摘录 · Mock 展示',
    setup: '共用本任务毛坯、工件零点和装夹信息；原验证记录未完整证明卡盘与夹具条件。',
    notes: '工步为基线工序和 NC 动作的界面摘要，不是新增加工指令。实际加工仍需完整工艺核对。',
    steps: item.steps.map(([id, description], stepIndex) => ({
      id: `${item.id}-${id}`,
      sequence: stepIndex + 1,
      name:
        item.id === 'ring-cutoff'
          ? ['预切保留连接料', '退刀', '倒角处理', '最终切断'][stepIndex]!
          : item.name,
      description,
      parameters: [],
    })),
    parameters: [
      recorded('surface-speed', '恒线速 G96', item.speed, 'm/min'),
      recorded('feed-per-rev', '每转进给 G99', item.feed, 'mm/r'),
      recorded('spindle-limit', '主轴转速上限 G50', 3600, 'r/min'),
    ],
    resources: [
      {
        id: `ring-tool-${item.tool}`,
        name: tools[item.tool]!,
        kind: 'tool',
        description: '刀号与刀片名称摘自对应基线 NC；实际装配和可用性待核对。',
        status: 'pending',
      },
    ],
    onsiteMeasurements:
      item.id === 'ring-cutoff'
        ? [
            onsite(
              'cutoff-assembly',
              '切断刀具与刀柄装配核对',
              '本工序专用：原验证仅覆盖基线建模装配，实际刀具、刀柄及伸出情况尚未提供。Demo 必填，不代表正式工艺审批。',
            ),
          ]
        : [],
  }))
  return {
    id: 'demo-ring',
    name: 'Ring_A · Golden-B7 环件示例',
    partName: 'Ring_A.step · 圆环 Ø41 / Ø39 × 5 mm',
    origin: 'mock',
    sourceDescription: 'Golden-B7 离线参考 · Mock 展示 · 未关联本地 STEP 文件 · 本次未执行制造校核',
    operations,
    initialOperationId: 'ring-facing',
    taskMeasurements: [
      onsite(
        'stock-od',
        '现场毛坯外径',
        '任务共用：基线毛坯外径 43 mm；当前实测值未知，需人工记录。',
        'mm',
      ),
      onsite(
        'stock-id',
        '现场毛坯预孔直径',
        '任务共用：基线预孔直径 38 mm；当前实测值未知，内孔加工与切断均依赖该条件。',
        'mm',
      ),
      onsite(
        'stock-length',
        '现场毛坯长度',
        '任务共用：基线毛坯长度 100 mm；当前实测值未知，不能用成品厚度代替。',
        'mm',
      ),
      onsite(
        'work-offset',
        '工件零点 / 偏置核对',
        '任务共用：基线使用 G54；当前现场偏置未知，且基线前端保留 +0.1 mm。',
      ),
      onsite(
        'fixture',
        '装夹方式与伸出量',
        '任务共用：原记录未完整验证卡盘和夹具，现场装夹条件尚未提供。',
      ),
    ],
  }
}

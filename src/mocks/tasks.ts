import type { DemoTask, ProcessOperation } from '../api/view-model'

// Synthetic fixtures only. No customer's CAM, STEP, drawing, or process card is embedded.
const operationNames = [
  '粗车',
  '粗车内外轮廓',
  '热处理',
  '车基准',
  '半精车外',
  '半精车内',
  '检测',
  '精车外',
  '终检',
]

function syntheticOperation(name: string, index: number): ProcessOperation {
  const sequence = index + 1
  const id = `ring-op-${String(sequence).padStart(2, '0')}`
  return {
    id,
    sequence,
    name,
    source: '合成工艺演示数据 / 非实际加工指导',
    setup: index === 2 || index === 8 ? undefined : '示意：确认工件装夹方式与加工基准。',
    steps:
      index === 2 || index === 8
        ? []
        : [
            { id: `${id}-step-a`, description: `示意：检查${name}的工艺准备条件` },
            { id: `${id}-step-b`, description: `示意：执行${name}相关加工步骤（无真实刀路）` },
          ],
    resources:
      index === 2
        ? []
        : [
            { id: `${id}-machine`, label: '设备', value: '演示机床 M-002', source: 'Mock' },
            { id: `${id}-tool`, label: '刀具', value: '演示刀具 T-003', source: 'Mock' },
          ],
    parameters:
      index === 2 || index === 8
        ? []
        : [
            { id: `${id}-speed`, label: '主轴转速', value: '仅演示 / 待工程校核', source: 'Mock' },
            { id: `${id}-feed`, label: '进给量', value: '仅演示 / 待工程校核', source: 'Mock' },
          ],
    measurements: index === 7 ? ['外轮廓关键尺寸待人工实测', '装夹余量待现场确认'] : [],
  }
}

export const demoTasks: DemoTask[] = [
  {
    id: 'demo-ring',
    fileName: 'Ring_A.step',
    title: '圆环零件（合成演示）',
    source: 'DEMO',
    operations: operationNames.map(syntheticOperation),
    initialOperationId: 'ring-op-08',
    ncPreviewName: 'Ring_A_demo_v01.nc',
  },
  {
    id: 'demo-short',
    fileName: 'Short_Part.step',
    title: '短流程（合成演示）',
    source: 'DEMO',
    operations: [syntheticOperation('粗车', 0), syntheticOperation('检测', 1)].map(
      (item, index) => ({
        ...item,
        id: `short-op-${index + 1}`,
        sequence: index + 1,
        source: '合成短流程数据',
      }),
    ),
    ncPreviewName: 'Short_Part_demo_v01.nc',
  },
  {
    id: 'demo-empty',
    fileName: 'Empty_Plan.step',
    title: '空工序异常场景（合成演示）',
    source: 'DEMO',
    operations: [],
    ncPreviewName: 'Not_Generated.nc',
  },
]

/** Mock boundary; a real task later comes from a separately implemented API adapter. */
export function getDemoTask(id: string): DemoTask | null {
  return demoTasks.find((task) => task.id === id) ?? null
}

/** Intentionally unexecutable placeholder: never use these strings for NC download. */
export function createDemoNcPreview(task: DemoTask, operation: ProcessOperation | null): string[] {
  return [
    '; DEMO ONLY - NOT AN NC PROGRAM - DO NOT EXECUTE',
    `; Synthetic fixture: ${task.fileName}`,
    `; Selected operation: ${operation ? operation.name : 'none'}`,
    '; All commands below are illustrative placeholders',
    'N010 ; 工序信息仅供界面预览',
    'N020 T... ; NOT A REAL TOOL SELECTION',
    'N030 S... F... ; NO CUTTING PARAMETERS',
    'N040 G... X... Z... ; NO VALID TOOLPATH',
    '; CAM, simulation and post-processing are NOT connected',
    ...Array.from(
      { length: 18 },
      (_, index) => `; 演示滚动占位 ${String(index + 1).padStart(2, '0')}`,
    ),
  ]
}

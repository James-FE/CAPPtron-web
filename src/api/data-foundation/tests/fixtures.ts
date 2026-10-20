import type { FoundationDataset, Provenance } from '../types'

export function provenance(): Provenance {
  return { dataMode: 'synthetic_demo', source: 'independent-contract-fixture' }
}
export function emptyDataset(): FoundationDataset {
  return {
    schemaVersion: '1.0',
    datasetVersion: 'contract-fixture-v1',
    dataMode: 'synthetic_demo',
    asOf: '2026-10-20T15:59:59.999Z',
    timeZone: 'Asia/Shanghai',
    parts: [],
    processPlans: [],
    machines: [],
    tools: [],
    knowledge: [],
    models: [],
    usageEvents: [],
  }
}
// 手写小型事实集，完全独立于生成算法；预期统计可由人工逐条核对。
export function smallDataset(): FoundationDataset {
  return {
    ...emptyDataset(),
    parts: [
      {
        id: 'part-a',
        name: '定位轴 Alpha',
        category: 'shaft',
        material: '45钢',
        features: ['外圆'],
        description: '测试零件',
        createdAt: '2026-10-18T03:00:00Z',
        provenance: provenance(),
      },
      {
        id: 'part-b',
        name: '定位轴 Beta',
        category: 'shaft',
        material: '45钢',
        features: [],
        description: '无方案测试零件',
        createdAt: '2026-10-19T16:00:00Z',
        provenance: provenance(),
      },
    ],
    machines: [
      {
        id: 'machine-a',
        name: '测试车床',
        machineType: 'cnc_lathe',
        capabilities: { axisCount: 2, maxSpindleSpeed: { value: 4000, unit: 'r/min' } },
        supportedOperations: ['turning'],
        createdAt: '2026-10-01T00:00:00Z',
        provenance: provenance(),
      },
    ],
    tools: [
      {
        id: 'tool-a',
        name: '测试外圆车刀',
        toolType: 'external_turning',
        specification: { description: '仅用于测试' },
        supportedOperations: ['turning'],
        compatibleMachineTypes: ['cnc_lathe'],
        createdAt: '2026-10-19T00:00:00Z',
        provenance: provenance(),
      },
    ],
    processPlans: [
      {
        id: 'plan-a',
        name: '测试车削方案',
        partId: 'part-a',
        version: 'v1',
        manufacturingType: 'turning',
        operations: [
          {
            id: 'op-facing',
            sequence: 10,
            name: '端面车削',
            method: 'turning',
            machineId: 'machine-a',
            toolIds: ['tool-a'],
            knowledgeIds: ['knowledge-a'],
          },
        ],
        createdAt: '2026-10-20T01:00:00Z',
        provenance: provenance(),
      },
    ],
    knowledge: [
      {
        id: 'knowledge-a',
        title: '基准规则',
        content: '合成规则 A',
        topic: 'process_rules',
        knowledgeCategory: 'industry',
        applicability: { operations: ['turning'], partCategories: ['shaft'], materials: [] },
        relatedAssets: [{ kind: 'process_plan', id: 'plan-a' }],
        createdAt: '2026-10-19T15:59:59.999Z',
        provenance: provenance(),
      },
      {
        id: 'knowledge-b',
        title: '材料规则',
        content: '合成规则 B',
        topic: 'material',
        knowledgeCategory: 'institute',
        applicability: { operations: [], partCategories: [], materials: [] },
        relatedAssets: [],
        createdAt: '2026-10-19T16:00:00Z',
        provenance: provenance(),
      },
      {
        id: 'knowledge-c',
        title: '装夹规则',
        content: '合成规则 C',
        topic: 'fixturing',
        knowledgeCategory: 'experience',
        applicability: { operations: [], partCategories: [], materials: [] },
        relatedAssets: [],
        createdAt: '2026-10-20T00:00:00Z',
        provenance: provenance(),
      },
    ],
    models: [
      {
        id: 'model-a',
        name: '测试算法登记',
        modelType: 'process_planning',
        integrationStatus: 'not_connected',
        supportedTasks: ['process_planning'],
        createdAt: '2026-10-01T00:00:00Z',
        provenance: provenance(),
      },
    ],
    usageEvents: [
      {
        id: 'ref-a1',
        type: 'knowledge_referenced',
        knowledgeId: 'knowledge-a',
        occurredAt: '2026-10-19T16:00:00Z',
        provenance: provenance(),
      },
      {
        id: 'ref-b1',
        type: 'knowledge_referenced',
        knowledgeId: 'knowledge-b',
        occurredAt: '2026-10-19T17:00:00Z',
        provenance: provenance(),
      },
      {
        id: 'ref-a2',
        type: 'knowledge_referenced',
        knowledgeId: 'knowledge-a',
        occurredAt: '2026-10-20T01:00:00Z',
        provenance: provenance(),
      },
      {
        id: 'ref-b2',
        type: 'knowledge_referenced',
        knowledgeId: 'knowledge-b',
        occurredAt: '2026-10-20T02:00:00Z',
        provenance: provenance(),
      },
      {
        id: 'invoke-before',
        type: 'model_invoked',
        modelId: 'model-a',
        occurredAt: '2026-10-19T15:59:59.999Z',
        provenance: provenance(),
      },
      {
        id: 'invoke-start',
        type: 'model_invoked',
        modelId: 'model-a',
        occurredAt: '2026-10-19T16:00:00Z',
        provenance: provenance(),
      },
      {
        id: 'invoke-end',
        type: 'model_invoked',
        modelId: 'model-a',
        task: 'process_planning',
        occurredAt: '2026-10-20T15:59:59.999Z',
        provenance: provenance(),
      },
    ],
  }
}

// @vitest-environment node
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { JsonCaseCatalogReader } from './JsonCaseCatalogReader'
import { caseToProcessPlan } from './adapter'
import {
  calculateContentDigest,
  validateCaseDocument,
  validateCaseIndex,
  verifyCaseVersion,
} from './validation'
import type { CaseDocument } from './types'

const read = (path: string) =>
  JSON.parse(readFileSync(`public/case-catalog/${path}`, 'utf8')) as unknown
const document = () => validateCaseDocument(read('golden-b7/v2.json'))
const index = () => validateCaseIndex(read('index.json'))

describe('标准案例契约', () => {
  it('正式目录仅保留 v2，Ra 为未填写目标要求，历史验证仍有限制', async () => {
    const value = document()
    const summary = index().cases[0]!
    expect(summary.versions.map((entry) => entry.version)).toEqual(['v2'])
    await expect(verifyCaseVersion(value, summary, 'v2')).resolves.toEqual(value)
    expect(value.processPlan.operations.map((op) => op.onsiteFields.length)).toEqual([
      0, 0, 0, 0, 1, 0,
    ])
    expect(value.processPlan.operations[4]!.onsiteFields[0]).toMatchObject({
      id: 'bore-surface-ra',
      name: '内孔表面粗糙度要求 Ra',
      unit: 'μm',
      value: null,
      source: 'unknown',
      inputKind: 'number',
      requirement: 'demo_required',
      description: '加工要求补充：参考内径为 Ø39 mm，请依据图纸或技术要求填写目标 Ra。',
    })
    expect(caseToProcessPlan(value).operations[4]!.onsiteMeasurements[0]?.unit).toBe('μm')
    expect(value.verificationEvidence[0]?.result).toBe('passed_with_limits')
    expect(value.verificationEvidence[0]?.limitations.length).toBeGreaterThan(0)
  })
  it('同一案例的不同版本产生不同会话身份，索引描述更新不改写历史快照', async () => {
    const first = document(),
      second = document()
    second.caseVersion.version = 'test-v3'
    for (const item of [...second.programAssets, ...second.verificationEvidence])
      item.caseVersion = 'test-v3'
    second.contentDigest = await calculateContentDigest(second)
    expect(caseToProcessPlan(first).id).not.toBe(caseToProcessPlan(second).id)
    const summary = index().cases[0]!
    summary.description = '当前索引描述更新，历史版本描述保持原值'
    await expect(verifyCaseVersion(first, summary, 'v2')).resolves.toEqual(first)
  })
  it('维护脚本与浏览器契约使用同一摘要算法', () => {
    expect(
      execFileSync(
        process.execPath,
        ['scripts/case-catalog-digest.mjs', 'public/case-catalog/golden-b7/v2.json'],
        { encoding: 'utf8' },
      ).trim(),
    ).toBe(document().contentDigest)
  })
  it.each([
    ['未知 Schema', (d: CaseDocument) => Object.assign(d, { schemaVersion: '2.0' })],
    ['缺少必要字段', (d: CaseDocument) => Reflect.deleteProperty(d.processPlan, 'operations')],
    ['错误类型', (d: CaseDocument) => Object.assign(d.processPlan, { name: 42 })],
    [
      '案例身份不一致',
      (d: CaseDocument) => {
        d.caseVersion.caseId = 'another'
      },
    ],
    [
      '重复工序',
      (d: CaseDocument) => {
        d.processPlan.operations.push(d.processPlan.operations[0]!)
      },
    ],
    [
      '重复工步',
      (d: CaseDocument) => {
        const op = d.processPlan.operations[0]!
        op.steps.push(op.steps[0]!)
      },
    ],
    [
      '重复参数',
      (d: CaseDocument) => {
        const p = d.processPlan.operations[0]!.parameters
        p.push(p[0]!)
      },
    ],
    [
      '重复任务字段',
      (d: CaseDocument) => {
        d.processPlan.taskFields.push(d.processPlan.taskFields[0]!)
      },
    ],
    [
      'NaN',
      (d: CaseDocument) => {
        d.processPlan.operations[0]!.parameters[0]!.value = NaN
      },
    ],
    [
      'Infinity',
      (d: CaseDocument) => {
        d.processPlan.operations[0]!.parameters[0]!.value = Infinity
      },
    ],
    [
      '未知单位',
      (d: CaseDocument) =>
        Object.assign(d.processPlan.operations[0]!.parameters[0]!, { unit: 'rpm_typo' }),
    ],
    [
      '未知来源',
      (d: CaseDocument) =>
        Object.assign(d.processPlan.operations[0]!.parameters[0]!, { source: 'agent' }),
    ],
    [
      '伪造已提供值',
      (d: CaseDocument) => {
        d.processPlan.operations[0]!.parameters[0]!.value = null
      },
    ],
    [
      '预置现场草稿',
      (d: CaseDocument) =>
        Object.assign(d.processPlan.taskFields[0]!, { value: 43, status: 'provided' }),
    ],
    [
      '资产身份缺失',
      (d: CaseDocument) => Reflect.deleteProperty(d.programAssets[0]!, 'caseVersion'),
    ],
    [
      '资产方案错配',
      (d: CaseDocument) => {
        d.programAssets[0]!.planId = 'another'
      },
    ],
    [
      '证据引用不存在',
      (d: CaseDocument) => {
        d.verificationEvidence[0]!.programAssetIds = ['unknown']
      },
    ],
    [
      '证据缺少限制',
      (d: CaseDocument) => {
        d.verificationEvidence[0]!.limitations = []
      },
    ],
    ['额外未知字段', (d: CaseDocument) => Object.assign(d, { approved: true })],
  ])('拒绝%s', (_name, mutate) => {
    const value = document()
    mutate(value)
    expect(() => validateCaseDocument(value)).toThrow()
  })

  it('拒绝重复索引、重复版本及目录逃逸路径', () => {
    for (const mutate of [
      (v: ReturnType<typeof index>) => v.cases.push(v.cases[0]!),
      (v: ReturnType<typeof index>) => v.cases[0]!.versions.push(v.cases[0]!.versions[0]!),
      (v: ReturnType<typeof index>) => {
        v.cases[0]!.versions[0]!.path = '../private.json'
      },
      (v: ReturnType<typeof index>) => {
        v.cases[0]!.versions[0]!.path = 'https://example.com/case.json'
      },
    ]) {
      const value = index()
      mutate(value)
      expect(() => validateCaseIndex(value)).toThrow()
    }
  })

  it('正文、索引摘要、案例与版本身份不匹配均拒绝，格式变化不影响摘要', async () => {
    const value = document(),
      summary = index().cases[0]!
    expect(await calculateContentDigest(JSON.parse(JSON.stringify(value)) as CaseDocument)).toBe(
      value.contentDigest,
    )
    value.processPlan.operations[0]!.parameters[0]!.value = 296
    await expect(verifyCaseVersion(value, summary, 'v2')).rejects.toThrow('摘要')
    await expect(verifyCaseVersion(document(), summary, 'test-v3')).rejects.toThrow('版本')
    await expect(
      verifyCaseVersion(document(), { ...summary, caseId: 'other' }, 'v2'),
    ).rejects.toThrow('案例 ID')
    summary.versions.find((entry) => entry.version === 'v2')!.contentDigest = '0'.repeat(64)
    await expect(verifyCaseVersion(document(), summary, 'v2')).rejects.toThrow('摘要')
  })

  it('六工序、全部历史切削参数和刀具保持一致，展示当前草稿定义', () => {
    const value = document(),
      plan = caseToProcessPlan(value)
    expect(plan.operations.map((op) => op.name)).toEqual([
      '端面车削',
      '外圆粗车',
      '外圆精车',
      '内孔粗车',
      '内孔精车',
      '切断',
    ])
    expect(plan.operations.map((op) => op.parameters.map((p) => p.value))).toEqual([
      [295, 0.3, 3600],
      [295, 0.3, 3600],
      [295, 0.3, 3600],
      [330, 0.1, 3600],
      [330, 0.1, 3600],
      [115, 0.1, 3600],
    ])
    for (const operation of plan.operations)
      expect(operation.parameters.map((p) => p.unit)).toEqual(['m/min', 'mm/r', 'r/min'])
    expect(plan.operations.map((op) => op.resources[0]?.name)).toEqual([
      'T0101 · VNMG 16 04 08',
      'T0101 · VNMG 16 04 08',
      'T0101 · VNMG 16 04 08',
      'T0202 · CCMT 09 T3 04',
      'T0202 · CCMT 09 T3 04',
      'T0404 · N151.2-185-20-5G',
    ])
    expect(plan.taskMeasurements).toHaveLength(5)
    expect(plan.operations.map((op) => op.onsiteMeasurements.length)).toEqual([0, 0, 0, 0, 1, 0])
    expect(value.programAssets[0]?.availability).toBe('metadata_only')
    plan.operations[0]!.parameters[0]!.value = 0
    expect(value.processPlan.operations[0]!.parameters[0]!.value).toBe(295)
    expect(plan.origin).toBe('mock')
  })
})

describe('JSON Reader', () => {
  it('尊重部署基础路径，每次读取新索引，不把案例打入 bundle', async () => {
    const request = vi.fn(
      async (url: RequestInfo | URL) =>
        new Response(JSON.stringify(String(url).endsWith('index.json') ? index() : document())),
    )
    const reader = new JsonCaseCatalogReader('/nested/app/', request)
    expect(await reader.listCases()).toHaveLength(1)
    expect((await reader.getCaseVersion('golden-b7', 'v2')).case.id).toBe('golden-b7')
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      '/nested/app/case-catalog/index.json',
      '/nested/app/case-catalog/index.json',
      '/nested/app/case-catalog/golden-b7/v2.json',
    ])
    expect(request).toHaveBeenLastCalledWith(
      '/nested/app/case-catalog/golden-b7/v2.json',
      expect.objectContaining({ cache: 'no-store' }),
    )
  })
  it.each([404, 500])('HTTP %s 明确失败，无 Fixture 回退', async (status) => {
    const reader = new JsonCaseCatalogReader('/', async () => new Response('', { status }))
    await expect(reader.listCases()).rejects.toThrow(`HTTP ${status}`)
  })
  it('非法 JSON、网络错误和未知版本明确失败', async () => {
    await expect(
      new JsonCaseCatalogReader('/', async () => new Response('{bad')).listCases(),
    ).rejects.toThrow('读取失败')
    await expect(
      new JsonCaseCatalogReader('/', async () => {
        throw new Error('offline')
      }).listCases(),
    ).rejects.toThrow('offline')
    await expect(
      new JsonCaseCatalogReader(
        '/',
        async () => new Response(JSON.stringify(index())),
      ).getCaseVersion('golden-b7', 'missing'),
    ).rejects.toThrow('不在当前索引')
  })
})

import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { MockDataFoundationReader } from '../mock/MockDataFoundationReader'
import { foundationDemoConfig } from '../mock/mockConfig'
import type { DataFoundationReader } from '../reader'
import type {
  AssetDetail,
  AssetKind,
  AssetPage,
  AssetQuery,
  FoundationOverview,
  FoundationResponse,
  GrowthTrend,
  HotAsset,
  HotAssetQuery,
  KnowledgeDistribution,
  OverviewQuery,
  ResourceSummary,
  TrendQuery,
} from '../types'
import { emptyDataset, smallDataset } from './fixtures'

const reader = (): DataFoundationReader =>
  new MockDataFoundationReader(foundationDemoConfig, smallDataset)
describe('MockDataFoundationReader', () => {
  it('七个方法符合长期返回契约，并附带快照来源', async () => {
    const client = reader()
    expectTypeOf(client.getOverview).returns.toEqualTypeOf<
      Promise<FoundationResponse<FoundationOverview>>
    >()
    expectTypeOf(client.getGrowthTrend).returns.toEqualTypeOf<
      Promise<FoundationResponse<GrowthTrend>>
    >()
    expectTypeOf(client.getKnowledgeDistribution).returns.toEqualTypeOf<
      Promise<FoundationResponse<KnowledgeDistribution>>
    >()
    expectTypeOf(client.getResourceSummary).returns.toEqualTypeOf<
      Promise<FoundationResponse<ResourceSummary>>
    >()
    expectTypeOf(client.getHotAssets).returns.toEqualTypeOf<
      Promise<FoundationResponse<HotAsset[]>>
    >()
    expectTypeOf(client.listAssets).returns.toEqualTypeOf<Promise<FoundationResponse<AssetPage>>>()
    expectTypeOf(client.getAssetDetail).returns.toEqualTypeOf<
      Promise<FoundationResponse<AssetDetail | null>>
    >()
    const responses = await Promise.all([
      client.getOverview(),
      client.getGrowthTrend({}),
      client.getKnowledgeDistribution(),
      client.getResourceSummary(),
      client.getHotAssets({}),
      client.listAssets({}),
      client.getAssetDetail('part', 'part-a'),
    ])
    for (const response of responses)
      expect(response.meta).toMatchObject({
        schemaVersion: '1.0',
        datasetVersion: 'contract-fixture-v1',
        dataMode: 'synthetic_demo',
        asOf: '2026-10-20T15:59:59.999Z',
        timeZone: 'Asia/Shanghai',
      })
    expect((await client.getHotAssets({ days: 2, timeZone: 'UTC' })).meta).toMatchObject({
      timeZone: 'UTC',
      window: { startDate: '2026-10-19', endDate: '2026-10-20' },
    })
  })
  it('筛选、名称搜索、稳定排序、分页和总条数', async () => {
    const client = reader()
    const first = await client.listAssets({
      kind: 'part',
      page: 1,
      pageSize: 1,
      sortBy: 'name',
      sortDirection: 'asc',
    })
    const second = await client.listAssets({
      kind: 'part',
      page: 2,
      pageSize: 1,
      sortBy: 'name',
      sortDirection: 'asc',
    })
    expect(first.data).toMatchObject({ total: 2, page: 1, pageSize: 1 })
    expect(first.data.items[0]!.id).toBe('part-a')
    expect(second.data.items[0]!.id).toBe('part-b')
    expect((await client.listAssets({ kind: 'part', page: 3, pageSize: 1 })).data.items).toEqual([])
    expect(
      (await client.listAssets({ keyword: ' ＡＬＰＨＡ ' })).data.items.map((item) => item.id),
    ).toEqual(['part-a'])
    expect(
      (await client.listAssets({ kind: 'knowledge', keyword: '基准' })).data.items[0]!.name,
    ).toBe('基准规则')
    expect((await client.listAssets({ keyword: '无此资源' })).data.total).toBe(0)
    expect((await client.listAssets({})).data.total).toBe(9)
  })
  it('排序相同主值使用 kind/id，时间按瞬间而非字符串排序', async () => {
    const data = smallDataset()
    data.parts[0]!.name = data.parts[1]!.name = '相同名称'
    data.parts.reverse()
    const client = new MockDataFoundationReader(foundationDemoConfig, () => data)
    for (const sortDirection of ['asc', 'desc'] as const)
      expect(
        (await client.listAssets({ kind: 'part', sortBy: 'name', sortDirection })).data.items.map(
          (item) => item.id,
        ),
      ).toEqual(['part-a', 'part-b'])
    data.parts[0]!.createdAt = '2026-10-20T00:00:00+08:00'
    data.parts[1]!.createdAt = '2026-10-19T23:00:00Z'
    const timestamps = new MockDataFoundationReader(foundationDemoConfig, () => data)
    expect(
      (
        await timestamps.listAssets({ kind: 'part', sortBy: 'createdAt', sortDirection: 'asc' })
      ).data.items.map((item) => item.id),
    ).toEqual(['part-b', 'part-a'])
  })
  it('返回每种完整详情；合法不存在返回 null，非法身份明确拒绝', async () => {
    const client = reader()
    for (const [kind, id] of [
      ['part', 'part-a'],
      ['process_plan', 'plan-a'],
      ['machine', 'machine-a'],
      ['tool', 'tool-a'],
      ['knowledge', 'knowledge-a'],
      ['model', 'model-a'],
    ] as const)
      expect((await client.getAssetDetail(kind, id)).data).toMatchObject({ kind, asset: { id } })
    expect((await client.getAssetDetail('part', 'missing')).data).toBeNull()
    expect((await client.getAssetDetail('machine', 'part-a')).data).toBeNull()
    await expect(client.getAssetDetail('other' as AssetKind, 'part-a')).rejects.toMatchObject({
      code: 'invalid_query',
    })
    await expect(client.getAssetDetail('part', '../bad')).rejects.toMatchObject({
      code: 'invalid_query',
    })
  })
  it.each([
    null,
    [],
    { page: 0 },
    { page: 1.5 },
    { page: 1000001 },
    { pageSize: 101 },
    { pageSize: NaN },
    { pageSize: '10' },
    { kind: 'other' },
    { keyword: 1 },
    { keyword: 'a'.repeat(201) },
    { sortBy: 'unknown' },
    { sortDirection: 'down' },
    { extra: true },
  ])('拒绝非法列表查询 %j', async (query) => {
    await expect(reader().listAssets(query as AssetQuery)).rejects.toMatchObject({
      code: 'invalid_query',
    })
  })
  it.each([
    null,
    { days: 0 },
    { days: 367 },
    { days: 1.5 },
    { days: Infinity },
    { endDate: '2026-02-29' },
    { endDate: '2026-10-21' },
    { timeZone: 'invalid' },
    { days: 366, endDate: '1900-01-01' },
    { extra: 'x' },
  ])('拒绝非法趋势查询 %j', async (query) => {
    await expect(reader().getGrowthTrend(query as TrendQuery)).rejects.toMatchObject({
      code: 'invalid_query',
    })
  })
  it.each([null, { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { endDate: '2026-10-21' }])(
    '拒绝非法热点查询 %j',
    async (query) => {
      await expect(reader().getHotAssets(query as HotAssetQuery)).rejects.toMatchObject({
        code: 'invalid_query',
      })
    },
  )
  it.each([null, { date: '2026-10-21' }, { date: 'bad' }, { timeZone: '+08:00' }, { extra: true }])(
    '拒绝非法概览查询 %j',
    async (query) => {
      await expect(reader().getOverview(query as OverviewQuery)).rejects.toMatchObject({
        code: 'invalid_query',
      })
    },
  )
  it('并发只加载一次；调用方修改输入、输出和配置均不改变已建立的快照', async () => {
    const input = smallDataset()
    const load = vi.fn(() => input)
    const client = new MockDataFoundationReader(foundationDemoConfig, load)
    const [overview, page] = await Promise.all([client.getOverview(), client.listAssets({})])
    input.parts.length = 0
    page.data.items[0]!.name = '外部修改'
    overview.meta.dataMode = 'live'
    expect((await client.getOverview()).data.totalAssets).toBe(8)
    expect((await client.listAssets({})).data.items.some((item) => item.name === '外部修改')).toBe(
      false,
    )
    expect(load).toHaveBeenCalledTimes(1)
    const config = { ...foundationDemoConfig }
    const generated = new MockDataFoundationReader(config)
    config.asOfDate = '2030-01-01'
    expect((await generated.getOverview()).data.date).toBe('2026-10-20')
  })
  it('读取失败保留错误，显式重试后建立快照；不会回退到另一份 Mock', async () => {
    const load = vi
      .fn<() => unknown>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(smallDataset())
    const client = new MockDataFoundationReader(foundationDemoConfig, load)
    await expect(client.getOverview()).rejects.toMatchObject({ code: 'read_failed' })
    expect((await client.getOverview()).data.totalAssets).toBe(8)
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('数据错误、版本错误、来源错误不转成零统计', async () => {
    const broken = smallDataset()
    broken.parts = []
    await expect(
      new MockDataFoundationReader(foundationDemoConfig, () => broken).getOverview(),
    ).rejects.toMatchObject({ code: 'data_integrity' })
    await expect(
      new MockDataFoundationReader(foundationDemoConfig, () => ({})).getOverview(),
    ).rejects.toMatchObject({ code: 'invalid_data' })
    await expect(
      new MockDataFoundationReader(foundationDemoConfig, () => ({
        ...emptyDataset(),
        schemaVersion: '9.0',
      })).getOverview(),
    ).rejects.toMatchObject({ code: 'contract_incompatible' })
    await expect(
      new MockDataFoundationReader(foundationDemoConfig, () => ({
        ...emptyDataset(),
        dataMode: 'live',
      })).getOverview(),
    ).rejects.toMatchObject({ code: 'data_integrity' })
  })
  it('空列表、详情、热点和统计均是带来源的正常空结果', async () => {
    const client = new MockDataFoundationReader(foundationDemoConfig, emptyDataset)
    expect((await client.listAssets({})).data).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
    expect((await client.getAssetDetail('part', 'part-a')).data).toBeNull()
    expect((await client.getHotAssets({})).data).toEqual([])
    expect((await client.getOverview()).data.totalAssets).toBe(0)
  })
})

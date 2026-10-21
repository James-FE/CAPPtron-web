import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DataFoundationPage } from './DataFoundationPage'
import { foundationTestReader } from '../../test/foundationReader'
import { FoundationError } from '../../api/data-foundation/reader'
import type { FoundationOverview, FoundationResponse } from '../../api/data-foundation/types'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})
const region = (name: string) => within(screen.getByRole('region', { name }))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('数据底座 Reader 驱动页面', () => {
  it('独立 Reader 驱动五项指标、日期、零值、百分比、模型状态和引用排名', async () => {
    const reader = foundationTestReader()
    const overview = vi.spyOn(reader, 'getOverview'),
      trend = vi.spyOn(reader, 'getGrowthTrend'),
      hot = vi.spyOn(reader, 'getHotAssets')
    render(<DataFoundationPage reader={reader} />)
    await screen.findByText('演示日新增')
    const kpis = screen.getByRole('region', { name: '数据概览' }).querySelectorAll('dd strong')
    expect(Array.from(kpis, (item) => item.textContent)).toEqual(['8', '4', '3', '5', '1'])
    expect(screen.queryByText(/模型调用/)).not.toBeInTheDocument()
    expect(screen.getByText('模拟数据')).toBeVisible()
    expect(screen.getByText(/independent-ui-reader-v1/)).toBeVisible()
    expect(screen.getByText(/快照 2026\/10\/20 23:59:59/)).toBeVisible()
    expect(
      region('每日新增趋势').getByRole('img', { name: '2026-10-14 新增知识 0 条' }),
    ).toBeInTheDocument()
    fireEvent.focus(region('每日新增趋势').getByRole('img', { name: '2026-10-20 新增知识 2 条' }))
    expect(region('每日新增趋势').getAllByText('2026-10-20 新增知识 2 条').length).toBeGreaterThan(
      0,
    )
    expect(region('知识构成').getByText('33.34%')).toBeVisible()
    expect(region('知识构成').getAllByText('33.33%')).toHaveLength(2)
    expect(region('模型库').getByText('未接入 1 个')).toBeVisible()
    expect(screen.queryByText(/已部署|知识图谱/)).not.toBeInTheDocument()
    expect(
      region('工业资源数据库概览').getByRole('button', { name: '查看零件库，2 条' }),
    ).toBeVisible()
    expect(
      region('热点知识')
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['01基准规则2 次', '02材料规则2 次'])
    expect(overview).toHaveBeenCalledWith()
    expect(trend).toHaveBeenCalledWith({ days: 7 })
    expect(hot).toHaveBeenCalledWith({ days: 7, limit: 5 })
  })
  it.each([
    ['getOverview', '数据概览'],
    ['getGrowthTrend', '新增趋势'],
    ['getKnowledgeDistribution', '知识构成'],
    ['getResourceSummary', '模型汇总'],
    ['getHotAssets', '热点知识'],
  ] as const)('%s 局部失败保留错误并能显式重试', async (method, label) => {
    const reader = foundationTestReader()
    vi.spyOn(reader, method).mockRejectedValueOnce(new FoundationError('read_failed', 'offline'))
    render(<DataFoundationPage reader={reader} />)
    const retry = await screen.findByRole('button', { name: `重试${label}` })
    expect(
      screen.getAllByRole('alert').some((item) => item.textContent?.includes('读取失败')),
    ).toBe(true)
    if (method === 'getOverview')
      expect(region('数据概览').queryByText('0')).not.toBeInTheDocument()
    fireEvent.click(retry)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: `重试${label}` })).not.toBeInTheDocument(),
    )
  })
  it('空数据保留零指标、连续日期、分类和准确空状态', async () => {
    render(<DataFoundationPage reader={foundationTestReader(true)} />)
    await screen.findByText('演示日新增')
    expect(
      Array.from(
        screen.getByRole('region', { name: '数据概览' }).querySelectorAll('dd strong'),
        (item) => item.textContent,
      ),
    ).toEqual(['0', '0', '0', '0', '0'])
    expect(screen.getByText('该窗口暂无知识引用')).toBeVisible()
    expect(screen.getByText('暂无模型登记')).toBeVisible()
    expect(region('知识构成').getAllByText('0%')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: '查看零件库，0 条' }))
    expect(await screen.findByText('没有匹配的资源')).toBeVisible()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })
  it('Reader 替换立即隐藏旧结果，旧请求迟到不覆盖新数据', async () => {
    const pending = deferred<FoundationResponse<FoundationOverview>>()
    const old = foundationTestReader()
    old.getOverview = () => pending.promise
    const { rerender } = render(<DataFoundationPage reader={old} />)
    expect(region('数据概览').getByRole('status')).toHaveTextContent('正在读取')
    const fresh = foundationTestReader(true)
    rerender(<DataFoundationPage reader={fresh} />)
    await screen.findByText('演示日新增')
    await act(async () => pending.resolve(await foundationTestReader().getOverview()))
    expect(
      Array.from(
        screen.getByRole('region', { name: '数据概览' }).querySelectorAll('dd strong'),
        (item) => item.textContent,
      ),
    ).toEqual(['0', '0', '0', '0', '0'])
  })
  it('来源为 live 时保留真实来源和实际模型状态，不写死模拟文案', async () => {
    const reader = foundationTestReader(false, 'live')
    render(<DataFoundationPage reader={reader} />)
    await screen.findByText('当日新增')
    expect(screen.getByText('真实数据')).toBeVisible()
    expect(region('模型库').getByText('可用 1 个')).toBeVisible()
    expect(screen.queryByText('演示日模拟模型调用')).not.toBeInTheDocument()
    expect(screen.queryByText('正式业务数据库尚未接入')).not.toBeInTheDocument()
  })
  it('六类目录、详情、关联跳转、完整正文与缺失字段均可读取', async () => {
    const reader = foundationTestReader()
    const list = vi.spyOn(reader, 'listAssets'),
      detail = vi.spyOn(reader, 'getAssetDetail')
    render(<DataFoundationPage reader={reader} />)
    fireEvent.click(await screen.findByRole('button', { name: '查看零件库，2 条' }))
    for (const [kind, id, label] of [
      ['part', 'part-a', '定位轴 Alpha'],
      ['process_plan', 'plan-a', '测试车削方案'],
      ['machine', 'machine-a', '测试车床'],
      ['tool', 'tool-a', '测试外圆车刀'],
      ['knowledge', 'knowledge-a', '基准规则'],
      ['model', 'model-a', '测试算法登记'],
    ] as const) {
      fireEvent.change(screen.getByLabelText('资源类型'), { target: { value: kind } })
      fireEvent.click(await region('资源列表').findByRole('button', { name: new RegExp(label) }))
      await waitFor(() => expect(region('资源详情').getByText(id, { exact: true })).toBeVisible())
      expect(detail).toHaveBeenLastCalledWith(kind, id)
      if (kind === 'machine')
        expect(region('资源详情').getAllByText('未提供').length).toBeGreaterThan(0)
      if (kind === 'knowledge') expect(region('资源详情').getByText('合成规则 A')).toBeVisible()
      if (kind === 'model') expect(region('资源详情').getByText('工艺规划')).toBeVisible()
    }
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'model', page: 1, pageSize: 10 }),
    )
    fireEvent.change(screen.getByLabelText('资源类型'), { target: { value: 'process_plan' } })
    fireEvent.click(await region('资源列表').findByRole('button', { name: /测试车削方案/ }))
    fireEvent.click(await region('资源详情').findByRole('button', { name: /零件库 · part-a/ }))
    await waitFor(() => expect(region('资源详情').getByText('定位轴 Alpha')).toBeVisible())
  })
  it('搜索只提交查询，并忽略旧搜索及旧详情的迟到响应', async () => {
    const reader = foundationTestReader(),
      original = reader.listAssets
    const slow = deferred<Awaited<ReturnType<typeof original>>>()
    const slowDetail = deferred<Awaited<ReturnType<typeof reader.getAssetDetail>>>()
    const readDetail = reader.getAssetDetail
    vi.spyOn(reader, 'listAssets').mockImplementation((query) =>
      query.keyword === 'Alpha' ? slow.promise : original(query),
    )
    vi.spyOn(reader, 'getAssetDetail').mockImplementation((kind, id) =>
      id === 'part-a' ? slowDetail.promise : readDetail(kind, id),
    )
    render(<DataFoundationPage reader={reader} />)
    fireEvent.click(await screen.findByRole('button', { name: '查看零件库，2 条' }))
    fireEvent.click(await region('资源列表').findByRole('button', { name: /定位轴 Alpha/ }))
    fireEvent.click(region('资源列表').getByRole('button', { name: /定位轴 Beta/ }))
    await region('资源详情').findByText('part-b', { exact: true })
    await act(async () => slowDetail.resolve(await readDetail('part', 'part-a')))
    expect(region('资源详情').queryByText('part-a', { exact: true })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('名称搜索'), { target: { value: 'Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.change(screen.getByLabelText('名称搜索'), { target: { value: 'Beta' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await region('资源列表').findByRole('button', { name: /定位轴 Beta/ })
    await act(async () => slow.resolve(await original({ kind: 'part', keyword: 'Alpha' })))
    expect(
      region('资源列表').queryByRole('button', { name: /定位轴 Alpha/ }),
    ).not.toBeInTheDocument()
  })
  it('目录与详情分别区分读取失败、重试和资源不存在', async () => {
    const reader = foundationTestReader()
    vi.spyOn(reader, 'listAssets').mockRejectedValueOnce(
      new FoundationError('read_failed', 'offline'),
    )
    const detail = vi
      .spyOn(reader, 'getAssetDetail')
      .mockRejectedValueOnce(new FoundationError('data_integrity', 'broken reference'))
    render(<DataFoundationPage reader={reader} />)
    fireEvent.click(await screen.findByRole('button', { name: '查看零件库，2 条' }))
    fireEvent.click(await screen.findByRole('button', { name: '重试资源列表' }))
    fireEvent.click(await region('资源列表').findByRole('button', { name: /定位轴 Alpha/ }))
    expect(await region('资源详情').findByRole('alert')).toHaveTextContent('数据完整性检查失败')
    fireEvent.click(screen.getByRole('button', { name: '重试资源详情' }))
    await region('资源详情').findByText('part-a', { exact: true })
    const response = await foundationTestReader().getAssetDetail('part', 'missing')
    detail.mockResolvedValueOnce(response)
    fireEvent.click(region('资源列表').getByRole('button', { name: /定位轴 Beta/ }))
    expect(await region('资源详情').findByText('资源不存在或已不可见：part-b')).toBeVisible()
    expect(region('资源列表').getAllByRole('button')).toHaveLength(4)
  })
})

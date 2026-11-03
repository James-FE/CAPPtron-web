import { beforeEach, expect, it, vi } from 'vitest'
import { CoreClient } from './client'
import { ExecutorReset, needsReset } from './executorReset'

const health = {
  executor_id: 'test',
  availability: 'observed',
  state: 'reset_required',
  reset_required: true,
  active_run_id: null,
}
const idle = { ...health, state: 'idle', reset_required: false }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const control = (command: string, status = 'confirmed') => ({
  command_id: command,
  executor_id: 'test',
  action: 'reset',
  status,
  allowed_actions: [],
})
let values: Map<string, string>
let storage: Pick<Storage, 'getItem' | 'setItem'>
beforeEach(() => {
  values = new Map()
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
})

it('发送前落盘，确认回执及空闲后完成，不启动加工', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(reply(health))
    .mockImplementationOnce(async () => {
      expect(reset.read()?.status).toBe('pending')
      return reply({}, 202)
    })
  const reset = new ExecutorReset(new CoreClient('', fetcher), 'core', storage)
  await reset.start()
  const id = reset.read()!.command_id
  fetcher.mockResolvedValueOnce(reply(control(id))).mockResolvedValueOnce(reply(idle))
  expect((await reset.observe()).record?.status).toBe('confirmed')
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    '/cam/executor',
    '/cam/executor/reset',
    `/cam/controls/${id}`,
    '/cam/executor',
  ])
})

it('提交回执丢失后重建客户端，仍只查询原命令', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(reply(health))
    .mockRejectedValueOnce(new Error('网络断开'))
  const api = new CoreClient('', fetcher)
  const reset = new ExecutorReset(api, 'core', storage)
  await expect(reset.start()).rejects.toThrow('网络断开')
  const id = reset.read()!.command_id
  const restored = new ExecutorReset(api, 'core', storage)
  await restored.start()
  fetcher.mockResolvedValueOnce(reply(control(id))).mockResolvedValueOnce(reply(idle))
  expect((await restored.observe()).record?.status).toBe('confirmed')
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it.each(['busy', 'offline', 'idle'])('%s 不提交复位', async (state) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ ...health, state }))
  const reset = new ExecutorReset(new CoreClient('', fetcher), 'core', storage)
  await expect(reset.start()).rejects.toThrow('不允许复位')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('拒绝活跃运行和不可达健康，即使同时显示 reset_required', () => {
  expect(needsReset({ ...health, availability: 'observed', active_run_id: 'active' })).toBe(false)
  expect(needsReset({ ...health, availability: 'unavailable' })).toBe(false)
})

it('存储失败或损坏时不提交', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(health))
  storage.setItem = () => {
    throw new Error('存储已满')
  }
  const reset = new ExecutorReset(new CoreClient('', fetcher), 'core', storage)
  await expect(reset.start()).rejects.toThrow('存储已满')
  values.set(reset.key, '{broken')
  await expect(reset.start()).rejects.toThrow()
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
})

it.each(['mismatch', 'missing', 'confirmed_busy'])('%s 保留待核对原命令', async (scenario) => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(reply(health))
    .mockResolvedValueOnce(reply({}))
  const reset = new ExecutorReset(new CoreClient('', fetcher), 'core', storage)
  await reset.start()
  const id = reset.read()!.command_id
  if (scenario === 'missing') fetcher.mockResolvedValueOnce(reply({}, 404))
  else
    fetcher
      .mockResolvedValueOnce(reply(control(scenario === 'mismatch' ? 'wrong' : id)))
      .mockResolvedValueOnce(reply({ ...health, state: 'busy' }))
  if (scenario === 'confirmed_busy') expect((await reset.observe()).record?.status).toBe('pending')
  else await expect(reset.observe()).rejects.toThrow()
  expect(reset.read()?.command_id).toBe(id)
  expect(reset.read()?.status).toBe('pending')
})

it('核对未知结果只调用原命令 reconcile；明确拒绝后才允许新身份', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(reply(health))
    .mockResolvedValueOnce(reply({}))
  const reset = new ExecutorReset(new CoreClient('', fetcher), 'core', storage)
  await reset.start()
  const id = reset.read()!.command_id
  fetcher
    .mockResolvedValueOnce(reply({ ...control(id, 'unknown'), allowed_actions: ['reconcile'] }))
    .mockResolvedValueOnce(reply(health))
    .mockResolvedValueOnce(reply({}))
  expect((await reset.observe()).record?.status).toBe('pending')
  expect(fetcher.mock.lastCall?.[0]).toBe(`/cam/controls/${id}/reconcile`)
  fetcher.mockResolvedValueOnce(reply(control(id, 'rejected'))).mockResolvedValueOnce(reply(health))
  expect((await reset.observe()).record?.status).toBe('rejected')
  fetcher.mockResolvedValueOnce(reply(health)).mockResolvedValueOnce(reply({}))
  await reset.start()
  expect(reset.read()?.command_id).not.toBe(id)
})

it('不同 Core 使用独立恢复记录', () => {
  const api = new CoreClient('')
  expect(new ExecutorReset(api, 'core-a', storage).key).not.toBe(
    new ExecutorReset(api, 'core-b', storage).key,
  )
})

import { beforeEach, expect, it, vi } from 'vitest'
import { CoreClient } from './client'
import { CommandJournal } from './commandJournal'
import { journalFetcher } from './journalTransport'

beforeEach(() => localStorage.clear())

it.each([
  [503, 8308, true, false],
  [503, 8308, false, true],
  [503, 8305, true, true],
  [409, 8125, true, false],
  [409, 8302, true, false],
])(
  'preserves uncertainty for status=%s code=%s confirmed=%s',
  async (status, code, confirmed, pending) => {
    const journal = new CommandJournal(localStorage)
    journal.update({ task_id: 'task', revision: 1 })
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code, message: 'executor status' },
          ...(confirmed ? { request_id: 'request' } : {}),
        }),
        { status },
      ),
    )
    const client = new CoreClient(
      '',
      journalFetcher(journal, '', new AbortController().signal, fetcher),
    )
    await expect(
      client.post('/cam/runs', {
        command_id: 'original',
        expected_current_revision: 1,
        plan_ref: { task_id: 'task' },
      }),
    ).rejects.toThrow()
    expect(Boolean(journal.read().pending)).toBe(pending)
    expect(fetcher).toHaveBeenCalledTimes(1)
  },
)

it('allows a new identity only after confirmed pre-admission rejection', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 8308, message: 'Worker unreachable' },
          request_id: 'request',
        }),
        { status: 503 },
      ),
    )
    .mockResolvedValueOnce(new Response('{}'))
  const client = new CoreClient('', fetcher)
  await expect(client.post('/cam/runs', { command_id: 'first' })).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledTimes(1)
  await client.post('/cam/runs', { command_id: 'second' })
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).command_id).toBe('second')
})

import { describe, expect, it, vi } from 'vitest'
import { CoreClient } from './client'

describe('Core HTTP contract', () => {
  it('reuses the command identity after an uncertain POST instead of creating another run', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network lost'))
      .mockResolvedValueOnce(new Response('{}'))
    const client = new CoreClient('', fetcher)
    await expect(
      client.post('/cam/runs', { command_id: 'first', plan_ref: 'same' }),
    ).rejects.toThrow('network lost')
    await client.post('/cam/runs', { command_id: 'second', plan_ref: 'same' })
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).command_id).toBe('first')
  })
  it('uploads raw STEP with query identity and never multipart', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ asset_id: 'asset' })))
    const client = new CoreClient('http://localhost:8000', fetcher)
    await client.upload(new File(['STEP'], 'ring.step'), 'upload-1')
    expect(fetcher.mock.calls[0]![0]).toBe(
      'http://localhost:8000/cad/assets?filename=ring.step&command_id=upload-1',
    )
    expect(fetcher.mock.calls[0]![1].headers['Content-Type']).toBe('application/octet-stream')
  })
  it('keeps slash-containing NC file IDs in query parameters', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
    await new CoreClient('', fetcher).file(
      { cam_run_id: 'run', version: 2, content_digest: 'digest' },
      'setup/T.NC',
    )
    expect(fetcher.mock.calls[0]![0]).toBe('/cam/runs/run/nc/versions/2/file?file_id=setup%2FT.NC')
  })
  it('surfaces backend failures without replacing them with demo data', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"error":{"message":"not configured"}}', { status: 503 }))
    await expect(new CoreClient('', fetcher).get('/cam/executor')).rejects.toThrow('503')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

it('observes in-flight CAM before returning its authoritative candidate', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'running' })))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'succeeded', current_candidate: { version: 1 } })),
    )
  const result = await new CoreClient('', fetcher).observeRun('run/a')
  expect(fetcher.mock.calls[1]![0]).toBe('/cam/runs/run%2Fa/observe')
  expect(fetcher.mock.calls[1]![1].method).toBe('POST')
  expect(result.status).toBe('succeeded')
})

it('does not dispatch observation for an already completed CAM run', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'succeeded' })))
  await new CoreClient('', fetcher).observeRun('run')
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('encodes process-card task keys using the Core opaque UTF-8 token contract', async () => {
  const { cardPath } = await import('./client')
  expect(cardPath('task-a', 2)).toBe('/process-cards/tasks/id_dGFzay1h/results/2')
  expect(cardPath('环/1', 1)).toBe('/process-cards/tasks/id_546vLzE/results/1')
})

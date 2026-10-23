import { describe, expect, it, vi } from 'vitest'
import { CoreClient, CoreHttpError, cardPath } from './client'

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
    const fetcher = vi.fn().mockImplementation(async () => new Response('{}'))
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
  it('retains Core error identity and input issues', async () => {
    const payload = {
      error: { code: 4003, message: 'Invalid input' },
      request_id: 'request-1',
      trace_id: 'trace-1',
      issues: [{ path: '/payload/source', code: 'missing', message: 'Source required' }],
      stage: 'prepare',
      reset_required: false,
      file_id: 'setup/T.NC',
    }
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 422 }))
    const error = await new CoreClient('', fetcher)
      .get('/inputs/prepare')
      .catch((value: unknown) => value)
    expect(error).toBeInstanceOf(CoreHttpError)
    expect(error).toMatchObject({
      status: 422,
      code: 4003,
      request_id: 'request-1',
      trace_id: 'trace-1',
      issues: payload.issues,
      stage: 'prepare',
      reset_required: false,
      file_id: 'setup/T.NC',
    })
  })
  it('retains HTTP status when a proxy returns a non-contract error body', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('null', { status: 502 }))
    const error = await new CoreClient('', fetcher)
      .get('/cam/executor')
      .catch((value: unknown) => value)
    expect(error).toMatchObject({ status: 502, code: null, request_id: null, issues: [] })
  })
  it('encodes card task IDs as canonical UTF-8 base64url tokens', () => {
    expect(cardPath('任务/甲', 2)).toBe('/process-cards/tasks/id_5Lu75YqhL-eUsg/results/2')
  })
  it('posts observe and reconcile without a JSON body', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('{}'))
    const client = new CoreClient('', fetcher)
    await client.observe('run/1')
    await client.reconcile('run/1')
    expect(fetcher.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['/cam/runs/run%2F1/observe', 'POST', undefined],
      ['/cam/runs/run%2F1/reconcile', 'POST', undefined],
    ])
  })
  it('returns ZIP headers with the exact downloaded bytes while preserving download()', async () => {
    const headers = {
      'Content-Disposition': 'attachment; filename="approved.zip"',
      'X-Content-SHA256': 'a'.repeat(64),
      'X-Engineering-Status': 'unconfirmed',
    }
    const fetcher = vi.fn().mockImplementation(async () => new Response('ZIP', { headers }))
    const client = new CoreClient('', fetcher)
    const ref = { cam_run_id: 'run', version: 2, content_digest: 'b'.repeat(64) }
    const item = await client.downloadPackage(ref)
    expect(item).toMatchObject({
      filename: 'approved.zip',
      sha256: 'a'.repeat(64),
      engineering_status: 'unconfirmed',
    })
    expect(item.blob.size).toBe(3)
    expect((await client.download(ref)).size).toBe(3)
  })
  it.each([
    ['attachment; filename="part;rev2.zip"', 'part;rev2.zip'],
    ['attachment; filename="part\\"quote.zip"', 'part"quote.zip'],
    ["attachment; filename*=UTF-8''%E9%9B%B6%E4%BB%B6.zip", '零件.zip'],
    ["attachment; filename=plain.zip; filename*=UTF-8'zh'%E9%9B%B6.zip", '零.zip'],
    ["attachment; filename=plain.zip; filename*=UTF-8''%XX", 'plain.zip'],
    ["attachment; filename=plain.zip; filename*=unsupported''abc", 'plain.zip'],
    ['attachment', null],
  ])('reads download filename from %s', async (disposition, filename) => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('ZIP', {
        headers: { 'Content-Disposition': disposition },
      }),
    )
    const result = await new CoreClient('', fetcher).downloadPackage({
      cam_run_id: 'run',
      version: 1,
      content_digest: 'a'.repeat(64),
    })
    expect(result.filename).toBe(filename)
  })
})

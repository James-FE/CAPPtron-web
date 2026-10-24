import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLiveWorkflow } from './useLiveWorkflow'
import fixture from '../../../e2e/fixtures/core-golden.json'

afterEach(() => vi.unstubAllGlobals())
describe('Live会话的异步边界', () => {
  it('替换输入会中止请求，迟到资产不能覆盖新任务', async () => {
    let finish: (response: Response) => void = () => {}
    const fetcher = vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          void [url, init]
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', fetcher)
    const first = new File(['first'], 'first.step'),
      second = new File(['second'], 'second.step')
    const { result, rerender } = renderHook(({ file }) => useLiveWorkflow(file), {
      initialProps: { file: first },
    })
    act(() => result.current.upload())
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const signal = fetcher.mock.calls[0]?.[1]?.signal
    rerender({ file: second })
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      finish(new Response(JSON.stringify(fixture.asset)))
    })
    expect(result.current.asset).toBeUndefined()
    expect(result.current.nc).toBeUndefined()
    expect(result.current.status).toBe('请选择并上传 STEP')
  })
  it('上传结果未知时重放同一command和原始File，不制造第二个意图', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture.asset)))
    vi.stubGlobal('fetch', fetcher)
    const file = new File(['STEP'], 'original.step')
    const { result } = renderHook(() => useLiveWorkflow(file))
    act(() => result.current.upload())
    await waitFor(() => expect(result.current.canRetry).toBe(true))
    act(() => result.current.upload())
    expect(fetcher).toHaveBeenCalledTimes(1)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.asset?.asset_id).toBe(fixture.asset.asset_id))
    expect(fetcher.mock.calls[0]?.[0]).toBe(fetcher.mock.calls[1]?.[0])
    expect(fetcher.mock.calls[1]?.[1].body).toBe(file)
  })
})

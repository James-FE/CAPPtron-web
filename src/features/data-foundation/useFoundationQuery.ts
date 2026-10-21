import { useCallback, useEffect, useState } from 'react'
import type { FoundationResponse } from '../../api/data-foundation/types'

type QueryState<T> = {
  status: 'loading' | 'success' | 'error'
  response?: FoundationResponse<T>
  error?: unknown
}

export function useFoundationQuery<T>(load: () => Promise<FoundationResponse<T>>) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<QueryState<T> & { load: typeof load; attempt: number }>({
    status: 'loading',
    load,
    attempt,
  })
  useEffect(() => {
    let current = true
    setState({ status: 'loading', load, attempt })
    Promise.resolve()
      .then(load)
      .then(
        (response) => {
          if (current) setState({ status: 'success', response, load, attempt })
        },
        (error: unknown) => {
          if (current) setState({ status: 'error', error, load, attempt })
        },
      )
    return () => {
      current = false
    }
  }, [load, attempt])
  // 参数变化的当次渲染也不显示旧结果；effect 清理后迟到响应无法覆盖新请求。
  const result: QueryState<T> =
    state.load === load && state.attempt === attempt ? state : { status: 'loading' }
  return { ...result, retry: useCallback(() => setAttempt((value) => value + 1), []) }
}
export type FoundationQuery<T> = ReturnType<typeof useFoundationQuery<T>>

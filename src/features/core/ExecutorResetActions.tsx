import { useEffect, useRef, useState } from 'react'
import { CoreClient } from '../../api/core/client'
import { ExecutorReset, needsReset } from '../../api/core/executorReset'
import type { ExecutorHealth } from '../../api/core/executorReset'
import type { LiveWorkflow } from './useLiveWorkflow'

const base = import.meta.env.VITE_API_BASE_URL ?? ''
const scope = new URL(base || '/', window.location.origin).href.replace(/\/$/, '')

export function ExecutorResetActions({ live }: { live: LiveWorkflow }) {
  const [health, setHealth] = useState<ExecutorHealth>()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [message, setMessage] = useState('正在检查执行器状态…')
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const running = useRef(false)

  async function check(start = false) {
    if (running.current) return
    running.current = true
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setError('')
    const api = new CoreClient(base, (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      }),
    )
    const reset = new ExecutorReset(api, scope)
    try {
      if (!navigator.locks) throw new Error('浏览器不支持复位互斥锁，请使用本机复位脚本。')
      // 等待同源页面释放锁；卸载会取消排队，StrictMode 回放也不会误报并发。
      setMessage('正在检查执行器状态，等待其他页面完成恢复…')
      await navigator.locks.request(reset.key, { signal: abort.signal }, async () => {
        if (start) {
          setMessage('正在提交复位…')
          await reset.start()
        }
        for (let attempt = 0; attempt < 30; attempt++) {
          abort.signal.throwIfAborted()
          const result = await reset.observe()
          abort.signal.throwIfAborted()
          setHealth(result.health)
          setPending(result.record?.status === 'pending')
          setRejected(result.record?.status === 'rejected')
          if (result.record?.status === 'pending') {
            setMessage(`复位待确认 · 命令 ${result.record.command_id}`)
            await new Promise<void>((resolve, reject) => {
              const stop = () => {
                clearTimeout(timer)
                reject(abort.signal.reason)
              }
              const timer = setTimeout(() => {
                abort.signal.removeEventListener('abort', stop)
                resolve()
              }, 1000)
              abort.signal.addEventListener('abort', stop, { once: true })
            })
            continue
          }
          setMessage(
            result.record?.status === 'rejected'
              ? '复位被拒绝，请核对 Mastercam、基准工程及 IPCServer 后重新复位。'
              : result.health.availability !== 'observed'
                ? '执行器暂不可达，请检查 Worker 连接。'
                : result.health.state === 'idle' && !result.health.reset_required
                  ? result.record?.status === 'confirmed'
                    ? '复位成功 · 执行器空闲，请手动重新发起加工。'
                    : '执行器空闲，无需复位。'
                  : needsReset(result.health)
                    ? '需要复位 · 请先保存工程、重启 Mastercam 并打开基准工程，确认 IPCServer 已加载。'
                    : '执行器忙碌或尚未就绪，暂不可复位。',
          )
          return
        }
        setMessage('复位尚未确认，已停止自动查询；可继续查询原复位命令。')
      })
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(cause instanceof Error ? cause.message : '复位状态查询失败')
        try {
          setPending(reset.read()?.status === 'pending')
          setRejected(reset.read()?.status === 'rejected')
        } catch {
          /* 损坏记录保留，由原错误提示处理。 */
        }
        setHealth(undefined)
      }
    } finally {
      if (controller.current === abort) {
        if (!abort.signal.aborted) setBusy(false)
        running.current = false
      }
    }
  }
  useEffect(() => {
    void check()
    return () => {
      controller.current?.abort()
      running.current = false
    }
    // 进入执行页时恢复原复位命令，不跟随加工状态渲染重复提交。
  }, [])

  return (
    <div className="executor-reset-controls" aria-label="执行器恢复">
      <p role={error ? 'alert' : 'status'} className={error ? 'warning-text' : 'muted-text'}>
        {error || message}
      </p>
      {pending && (
        <p className="muted-text">
          复位结果尚未确认，请继续查询原命令。持续未确认时，请维护人员检查 Worker
          恢复日志；不要重复提交复位或删除恢复记录。
        </p>
      )}
      <div className="executor-reset-buttons">
        <button className="button" disabled={busy || live.busy} onClick={() => void check()}>
          {pending ? '继续查询复位' : '检查执行器状态'}
        </button>
        <button
          className="button"
          disabled={busy || live.busy || pending || !needsReset(health)}
          onClick={() => void check(true)}
        >
          {busy && pending ? '复位中…' : rejected ? '重新复位执行器' : '复位执行器'}
        </button>
        <button
          className="button"
          disabled={busy || live.busy || live.canRetry || !live.cam}
          onClick={live.refreshCam}
        >
          继续查询 CAM / NC
        </button>
      </div>
    </div>
  )
}

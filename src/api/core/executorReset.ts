import { randomId } from '../browserCrypto'
import { CoreClient, CoreHttpError } from './client'

export type ExecutorHealth = {
  executor_id: string
  availability: 'observed' | 'unavailable'
  state: string | null
  reset_required: boolean | null
  active_run_id: string | null
}
type ResetRecord = {
  command_id: string
  executor_id: string
  status: 'pending' | 'confirmed' | 'rejected'
}
type ResetControl = {
  command_id: string
  executor_id: string
  action: string
  status: 'submitted' | 'unknown' | 'confirmed' | 'rejected'
  allowed_actions: string[]
}
export const needsReset = (health?: ExecutorHealth) =>
  health?.availability === 'observed' &&
  health.state === 'reset_required' &&
  health.reset_required === true &&
  !health.active_run_id

// 复位属于执行器而非规划任务；日志按 Core 地址隔离，不覆盖加工命令日志。
export class ExecutorReset {
  readonly key: string
  constructor(
    private readonly api: CoreClient,
    scope: string,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  ) {
    this.key = `capptron.core.executor-reset.v1.${encodeURIComponent(scope)}`
  }
  read(): ResetRecord | undefined {
    const raw = this.storage.getItem(this.key)
    if (raw === null) return undefined
    const record = JSON.parse(raw) as ResetRecord | null
    if (
      !record ||
      typeof record.command_id !== 'string' ||
      !record.command_id ||
      typeof record.executor_id !== 'string' ||
      !record.executor_id ||
      !['pending', 'confirmed', 'rejected'].includes(record.status)
    )
      throw new Error('复位恢复记录损坏，请保留记录并联系维护人员。')
    return record
  }
  private save(record: ResetRecord) {
    const encoded = JSON.stringify(record)
    this.storage.setItem(this.key, encoded)
    if (this.storage.getItem(this.key) !== encoded)
      throw new Error('无法保存复位命令，已停止操作。')
  }
  async health() {
    const health = await this.api.get<ExecutorHealth>('/cam/executor')
    if (
      typeof health?.executor_id !== 'string' ||
      !health.executor_id ||
      !['observed', 'unavailable'].includes(health.availability) ||
      !(health.state === null || typeof health.state === 'string') ||
      !(health.reset_required === null || typeof health.reset_required === 'boolean') ||
      !(health.active_run_id === null || typeof health.active_run_id === 'string')
    )
      throw new Error('执行器状态回执无效，已停止复位。')
    return health
  }
  async start() {
    if (this.read()?.status === 'pending') return
    const health = await this.health()
    if (!needsReset(health)) throw new Error('执行器当前不允许复位，请重新检查状态。')
    const record: ResetRecord = {
      command_id: randomId(),
      executor_id: health.executor_id,
      status: 'pending',
    }
    // 发送前持久化。提交回复丢失后只查原身份，不能重新提交制造控制命令。
    this.save(record)
    try {
      await this.api.post('/cam/executor/reset', { command_id: record.command_id })
    } catch (error) {
      if (
        error instanceof CoreHttpError &&
        error.confirmed &&
        error.status >= 400 &&
        error.status < 500
      )
        this.save({ ...record, status: 'rejected' })
      throw error
    }
  }
  async observe() {
    const record = this.read()
    if (!record || record.status !== 'pending') return { health: await this.health(), record }
    let control: ResetControl
    try {
      control = await this.api.get<ResetControl>(
        `/cam/controls/${encodeURIComponent(record.command_id)}`,
      )
    } catch (error) {
      if (error instanceof CoreHttpError && error.status === 404)
        throw new Error(
          `Core 未找到原复位命令 ${record.command_id}，请保留记录并核对后端；未重新提交。`,
        )
      throw error
    }
    if (
      control.command_id !== record.command_id ||
      control.executor_id !== record.executor_id ||
      control.action !== 'reset' ||
      !['submitted', 'unknown', 'confirmed', 'rejected'].includes(control.status) ||
      !Array.isArray(control.allowed_actions)
    )
      throw new Error('原复位命令回执身份或状态不匹配，已停止操作。')
    const health = await this.health()
    if (health.executor_id !== record.executor_id)
      throw new Error('执行器身份已改变，请核对原复位命令。')
    if (control.status === 'rejected') {
      const rejected: ResetRecord = { ...record, status: 'rejected' }
      this.save(rejected)
      return { health, record: rejected }
    }
    if (
      control.status === 'confirmed' &&
      health.availability === 'observed' &&
      health.state === 'idle' &&
      health.reset_required === false &&
      !health.active_run_id
    ) {
      const confirmed: ResetRecord = { ...record, status: 'confirmed' }
      this.save(confirmed)
      return { health, record: confirmed }
    }
    if (control.allowed_actions.includes('reconcile'))
      await this.api.request(`/cam/controls/${encodeURIComponent(record.command_id)}/reconcile`, {
        method: 'POST',
      })
    return { health, record }
  }
}

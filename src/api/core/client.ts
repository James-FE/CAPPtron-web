export type Task = { task_id: string; current_revision: number; feedback_version: number }
export type NcRef = { cam_run_id: string; version: number; content_digest: string }
export type PlanRef = {
  task_id: string
  result_id: string
  revision: number
  archive_digest: string
}
export type CamRun = {
  cam_run_id: string
  status: string
  phase: string
  current_candidate: NcRef | null
  allowed_actions: string[]
  error?: unknown
}
export type NcVersion = {
  ref: NcRef
  review_status: string
  allowed_actions: string[]
  files: { file_id: string; filename: string }[]
}
export type ApprovedPlans = {
  execution_configured: boolean
  execution_profile_id: string | null
  plans: { plan_ref: PlanRef; profile_matches: boolean }[]
}
export type Plan = {
  payload: {
    operations: {
      id: string
      name?: string
      steps?: { id: string; sequence: number; content: string }[]
      attributes: {
        parameters?: Record<string, number>
        tool?: { station?: number; tool_number?: number }
        setup_id?: string
      }
    }[]
    extensions: {
      template: { digest: string }
      plan_digest: string
      reference_only: boolean
      execution_ready: boolean
      engineering_status?: string
    }
  }
}
export type ParseResult = {
  command_id: string
  asset_id: string
  source_sha256: string
  status: 'running' | 'parsed' | 'failed'
  report_sha256?: string
  analysis?: unknown
  diagnostic?: unknown
  execution_ready: false
}
export type Asset = { asset_id: string; sha256: string; filename: string; status: string }
const part = encodeURIComponent
export function cardPath(task: string, revision: number) {
  const bytes = new TextEncoder().encode(task)
  const token = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `/process-cards/tasks/id_${token}/results/${revision}`
}
export const ncPath = (ref: NcRef) => `/cam/runs/${part(ref.cam_run_id)}/nc/versions/${ref.version}`
export class CoreHttpError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Core HTTP ${status}: ${detail}`)
  }
}
export class CoreClient {
  private pending = new Map<string, string>()
  constructor(
    readonly base: string,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(this.base.replace(/\/$/, '') + path, init)
    if (!response.ok) throw new CoreHttpError(response.status, await response.text())
    return response.json() as Promise<T>
  }
  get<T>(path: string) {
    return this.request<T>(path)
  }
  async post<T>(path: string, body: Record<string, unknown>, reviewer?: string) {
    const { command_id: command, ...content } = body
    const key = JSON.stringify([path, content, reviewer])
    const commandId = typeof command === 'string' ? (this.pending.get(key) ?? command) : undefined
    if (commandId) this.pending.set(key, commandId)
    try {
      const result = await this.request<T>(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(reviewer ? { 'X-Reviewer-Id': reviewer } : {}),
        },
        body: JSON.stringify(commandId ? { ...content, command_id: commandId } : body),
      })
      this.pending.delete(key)
      return result
    } catch (error) {
      if (error instanceof CoreHttpError && error.status >= 400 && error.status < 500)
        this.pending.delete(key)
      throw error
    }
  }
  async observeRun(key: string) {
    const path = `/cam/runs/${part(key)}`
    const run = await this.get<CamRun>(path)
    return ['accepted', 'running'].includes(run.status)
      ? this.post<CamRun>(`${path}/observe`, {})
      : run
  }
  upload(file: File, command: string) {
    return this.request<Asset>(
      `/cad/assets?${new URLSearchParams({ filename: file.name, command_id: command })}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file },
    )
  }
  file(ref: NcRef, id: string) {
    return this.get<{ text: string }>(`${ncPath(ref)}/file?${new URLSearchParams({ file_id: id })}`)
  }
  async download(ref: NcRef) {
    const response = await this.fetcher(this.base.replace(/\/$/, '') + ncPath(ref) + '/download')
    if (!response.ok) throw new CoreHttpError(response.status, await response.text())
    return response.blob()
  }
}

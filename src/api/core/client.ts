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
    operations: { id: string; attributes: { parameters?: Record<string, number> } }[]
    extensions: {
      template: { digest: string }
      plan_digest: string
      reference_only: boolean
      execution_ready: boolean
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
export const ncPath = (ref: NcRef) => `/cam/runs/${part(ref.cam_run_id)}/nc/versions/${ref.version}`
export function cardPath(taskId: string, revision: number) {
  if (!taskId || !Number.isInteger(revision) || revision < 1)
    throw new Error('Invalid card identity')
  const bytes = new TextEncoder().encode(taskId)
  const token = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `/process-cards/tasks/id_${token}/results/${revision}`
}
export type CoreIssue = { path: string; code: string; message: string }
type CoreErrorBody = {
  error?: { code?: number; message?: string }
  request_id?: string
  trace_id?: string
  issues?: CoreIssue[]
  stage?: string | null
  reset_required?: boolean | null
  file_id?: string | null
}
export class CoreHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    message: string,
    readonly request_id: string | null,
    readonly trace_id: string | null,
    readonly issues: CoreIssue[],
    readonly stage: string | null,
    readonly reset_required: boolean | null,
    readonly file_id: string | null,
  ) {
    super(`Core HTTP ${status}: ${message}`)
  }
}
async function coreError(response: Response): Promise<CoreHttpError> {
  let body: CoreErrorBody = {}
  try {
    const value: unknown = await response.json()
    if (value !== null && typeof value === 'object' && !Array.isArray(value))
      body = value as CoreErrorBody
  } catch {
    // 代理错误页可能不是 JSON，保留 HTTP 状态供调用方判断。
  }
  return new CoreHttpError(
    response.status,
    typeof body.error?.code === 'number' ? body.error.code : null,
    typeof body.error?.message === 'string'
      ? body.error.message
      : response.statusText || 'Request failed',
    typeof body.request_id === 'string' ? body.request_id : null,
    typeof body.trace_id === 'string' ? body.trace_id : null,
    Array.isArray(body.issues)
      ? body.issues.filter(
          (issue) =>
            issue !== null &&
            typeof issue === 'object' &&
            typeof issue.path === 'string' &&
            typeof issue.code === 'string' &&
            typeof issue.message === 'string',
        )
      : [],
    typeof body.stage === 'string' ? body.stage : null,
    typeof body.reset_required === 'boolean' ? body.reset_required : null,
    typeof body.file_id === 'string' ? body.file_id : null,
  )
}
export class CoreClient {
  private pending = new Map<string, string>()
  constructor(
    readonly base: string,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(this.base.replace(/\/$/, '') + path, init)
    if (!response.ok) throw await coreError(response)
    return response.json() as Promise<T>
  }
  get<T>(path: string) {
    return this.request<T>(path)
  }
  postWithoutBody<T>(path: string) {
    return this.request<T>(path, { method: 'POST' })
  }
  observe(runId: string) {
    return this.postWithoutBody<CamRun>(`/cam/runs/${part(runId)}/observe`)
  }
  reconcile(runId: string) {
    return this.postWithoutBody<CamRun>(`/cam/runs/${part(runId)}/reconcile`)
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
  upload(file: File, command: string) {
    return this.request<Asset>(
      `/cad/assets?${new URLSearchParams({ filename: file.name, command_id: command })}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file },
    )
  }
  file(ref: NcRef, id: string) {
    return this.get<{ text: string }>(`${ncPath(ref)}/file?${new URLSearchParams({ file_id: id })}`)
  }
  async downloadPackage(ref: NcRef) {
    const response = await this.fetcher(this.base.replace(/\/$/, '') + ncPath(ref) + '/download')
    if (!response.ok) throw await coreError(response)
    const disposition = response.headers.get('Content-Disposition')
    const filename = disposition?.match(/(?:^|;)\s*filename="?([^";]+)"?/i)?.[1] ?? null
    return {
      blob: await response.blob(),
      filename,
      sha256: response.headers.get('X-Content-SHA256'),
      engineering_status: response.headers.get('X-Engineering-Status'),
    }
  }
  async download(ref: NcRef) {
    return (await this.downloadPackage(ref)).blob
  }
}

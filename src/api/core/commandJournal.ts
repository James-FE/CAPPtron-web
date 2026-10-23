import type { NcRef } from './client'

export type CommandDomain = 'upload' | 'parse' | 'task' | 'replan' | 'card' | 'cam'
export type PendingCommand = {
  domain: CommandDomain
  command_id: string
  request: Record<string, unknown>
  expected_version: number | null
  task_id?: string
  revision?: number
  run_id?: string
  asset_id?: string
  reviewer?: string
  rejected_status?: number
  rejected_code?: number
}
export type WorkflowLocation = {
  asset_id?: string
  parse_command_id?: string
  task_id?: string
  revision?: number
  run_id?: string
  nc_ref?: NcRef
  pending?: PendingCommand
  unrecoverable?: boolean
  drafts?: Record<string, unknown>
}
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const domains: CommandDomain[] = ['upload', 'parse', 'task', 'replan', 'card', 'cam']
function validId(value: unknown) {
  return value === undefined || (typeof value === 'string' && value.length > 0)
}
function validRevision(value: unknown) {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 0)
}
function validNcRef(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const ref = value as NcRef
  return (
    typeof ref.cam_run_id === 'string' &&
    !!ref.cam_run_id &&
    Number.isInteger(ref.version) &&
    ref.version > 0 &&
    /^[a-f0-9]{64}$/.test(ref.content_digest)
  )
}

export class CommandJournal {
  static readonly key = 'capptron.core.workflow.v1'
  readonly key: string
  constructor(
    private readonly storage: StoragePort = localStorage,
    readonly scope = '',
  ) {
    this.key = `${CommandJournal.key}${scope ? `.${encodeURIComponent(scope)}` : ''}`
  }

  read(): WorkflowLocation {
    const raw = this.storage.getItem(this.key)
    if (raw === null) return {}
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('Corrupt Core workflow storage')
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Corrupt Core workflow storage')
    return this.validate(value as WorkflowLocation)
  }

  private validate(state: WorkflowLocation) {
    if (
      ![state.asset_id, state.parse_command_id, state.task_id, state.run_id].every(validId) ||
      !validRevision(state.revision) ||
      (state.nc_ref !== undefined && !validNcRef(state.nc_ref)) ||
      (state.unrecoverable !== undefined && typeof state.unrecoverable !== 'boolean')
    )
      throw new Error('Corrupt Core workflow identity')
    if (
      state.drafts !== undefined &&
      (!state.drafts || typeof state.drafts !== 'object' || Array.isArray(state.drafts))
    )
      throw new Error('Corrupt Core drafts')
    const p = state.pending
    if (p !== undefined && (!p || typeof p !== 'object' || Array.isArray(p)))
      throw new Error('Corrupt Core command journal')
    if (
      p &&
      (!domains.includes(p.domain) ||
        !validId(p.command_id) ||
        !p.command_id ||
        !p.request ||
        typeof p.request !== 'object' ||
        Array.isArray(p.request) ||
        (p.domain !== 'upload' && p.request.command_id !== p.command_id) ||
        (!validRevision(p.expected_version) && p.expected_version !== null) ||
        ![p.task_id, p.asset_id, p.run_id, p.reviewer].every(validId) ||
        !validRevision(p.revision) ||
        (p.domain === 'upload' &&
          (typeof p.request.filename !== 'string' ||
            !p.request.filename ||
            !Number.isInteger(p.request.size_bytes) ||
            (p.request.size_bytes as number) < 1 ||
            typeof p.request.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(p.request.sha256))) ||
        (p.domain === 'parse' && !p.asset_id) ||
        (p.domain === 'task' &&
          (!p.asset_id ||
            typeof p.request.schema_version !== 'string' ||
            !p.request.payload ||
            typeof p.request.payload !== 'object' ||
            Array.isArray(p.request.payload))) ||
        (['replan', 'card', 'cam'].includes(p.domain) && !p.task_id) ||
        (p.task_id !== undefined && p.task_id !== state.task_id) ||
        (['upload', 'parse', 'task'].includes(p.domain) && p.expected_version !== null) ||
        (p.domain === 'replan' &&
          (p.request.base_revision !== p.expected_version ||
            !validRevision(p.request.expected_feedback_version) ||
            p.request.expected_feedback_version === undefined)) ||
        (p.domain === 'card' && (!p.reviewer || !p.task_id || !p.revision)) ||
        (p.domain === 'card' &&
          (p.request.expected_feedback_version !== p.expected_version ||
            p.request.decision !== 'approve')) ||
        (p.domain === 'cam' &&
          (p.request.expected_current_revision !== p.expected_version ||
            !p.request.plan_ref ||
            typeof p.request.plan_ref !== 'object' ||
            (p.request.plan_ref as { task_id?: unknown }).task_id !== p.task_id)) ||
        (p.rejected_status !== undefined &&
          (!Number.isInteger(p.rejected_status) ||
            !Number.isInteger(p.rejected_code) ||
            p.rejected_status < 400 ||
            p.rejected_status >= 500)) ||
        (p.rejected_code !== undefined && p.rejected_status === undefined))
    )
      throw new Error('Corrupt Core command journal')
    return state
  }

  private save(state: WorkflowLocation) {
    this.validate(state)
    const encoded = JSON.stringify(state)
    this.storage.setItem(this.key, encoded)
    if (this.storage.getItem(this.key) !== encoded)
      throw new Error('Core workflow storage did not persist')
  }

  update(patch: Partial<WorkflowLocation>) {
    this.save({ ...this.read(), ...patch })
  }

  begin(pending: PendingCommand) {
    const current = this.read()
    if (current.pending)
      throw new Error(`Pending ${current.pending.domain} command must be resolved first`)
    this.save({ ...current, pending })
  }

  amendPending(commandId: string, patch: Partial<PendingCommand>) {
    const current = this.read()
    if (current.pending?.command_id !== commandId) return
    this.save({ ...current, pending: { ...current.pending, ...patch } })
  }

  clearPending(commandId: string) {
    const current = this.read()
    if (current.pending?.command_id !== commandId) return
    this.save({ ...current, pending: undefined })
  }
}

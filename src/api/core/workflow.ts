import { cardPath, CoreHttpError, ncPath } from './client'
import type {
  ApprovedPlans,
  Asset,
  CamRun,
  CoreClient,
  NcRef,
  ParseResult,
  PlanRef,
  Task,
} from './client'
import { CommandJournal } from './commandJournal'
import type { PendingCommand } from './commandJournal'
import { parseNcVersion, parsePlanProduced } from './dto'
import type { NcFileDto, NcVersionDto, PlanProducedDto } from './dto'
import { matchIntegrationTemplate } from './integrationConfig'
import type { IntegrationConfig, IntegrationTemplate } from './integrationConfig'

type Card = { status: string; expected_feedback_version: number; revision?: number }
type PlanningRun = { run_id: string; status: string; output_revision?: number | null }
type NcFile = NcFileDto & { newline: string; text: string }
type State = {
  asset?: Asset
  parse?: ParseResult
  task?: Task
  planningRun?: PlanningRun
  plan?: PlanProducedDto
  integrationTemplate?: IntegrationTemplate
  configurationError?: string
  card?: Card
  approved?: ApprovedPlans
  camRuns?: CamRun[]
  camRun?: CamRun
  nc?: NcVersionDto
  ncFiles?: NcFile[]
  ncReady: boolean
  unrecoverable: boolean
}

const enc = encodeURIComponent
const taskPath = (taskId: string) => `/planning/tasks/${enc(taskId)}`
const terminal = (status: string) => ['completed', 'failed', 'cancelled'].includes(status)
const parseTerminal = (status: string) => status === 'parsed' || status === 'failed'
class TaskUnavailableError extends Error {}
function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
async function digest(file: File) {
  return hex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
}

/** 一个 Core 任务选择及其持久化的未决命令；写操作由页面明确触发。 */
export class CoreWorkflow {
  private state: State = { ncReady: false, unrecoverable: false }
  private selection = 0
  private taskReadGeneration = 0
  private ncReadGeneration = 0
  private camReadGeneration = 0
  private parseReadGeneration = 0
  private planningReadGeneration = 0
  readonly journal: CommandJournal
  constructor(
    private readonly api: CoreClient,
    journal?: CommandJournal,
    private readonly commandId: () => string = () => crypto.randomUUID(),
    private readonly config?: IntegrationConfig,
  ) {
    this.journal = journal ?? new CommandJournal(localStorage, api.base)
    if (this.journal.scope !== api.base)
      throw new Error('Core journal belongs to a different service')
  }
  snapshot(): Readonly<State> {
    return this.state
  }
  location() {
    return this.journal.read()
  }
  private selected(token: number, taskId?: string) {
    return token === this.selection && (!taskId || this.journal.read().task_id === taskId)
  }
  selectTask(taskId: string) {
    if (this.journal.read().pending) throw new Error('Pending command blocks task selection')
    this.adoptTask(taskId, false)
  }
  private adoptTask(taskId: string, preserveSource: boolean) {
    this.selection++
    this.journal.update({
      asset_id: preserveSource ? this.journal.read().asset_id : undefined,
      parse_command_id: preserveSource ? this.journal.read().parse_command_id : undefined,
      task_id: taskId,
      revision: undefined,
      run_id: undefined,
      nc_ref: undefined,
      unrecoverable: false,
    })
    this.state = { ncReady: false, unrecoverable: false }
  }
  setDraft(taskId: string, revision: number, field: string, value: unknown) {
    const location = this.journal.read()
    this.journal.update({
      drafts: { ...location.drafts, [`${taskId}:${revision}:${field}`]: value },
    })
  }
  clearDrafts(taskId: string, revision: number) {
    const prefix = `${taskId}:${revision}:`
    const drafts = { ...this.journal.read().drafts }
    for (const key of Object.keys(drafts)) if (key.startsWith(prefix)) delete drafts[key]
    this.journal.update({ drafts })
  }
  private hasDrafts(taskId: string, revision: number) {
    return Object.keys(this.journal.read().drafts ?? {}).some((key) =>
      key.startsWith(`${taskId}:${revision}:`),
    )
  }
  private bindAsset(assetId: string, parseCommandId?: string) {
    if (this.journal.read().pending) throw new Error('Pending command must be resolved first')
    this.selection++
    this.journal.update({
      asset_id: assetId,
      parse_command_id: parseCommandId,
      task_id: undefined,
      revision: undefined,
      run_id: undefined,
      nc_ref: undefined,
      unrecoverable: false,
    })
    this.state = { ncReady: false, unrecoverable: false }
  }
  async reuseParse(assetId: string, parseCommandId: string) {
    const token = this.selection
    const result = await this.api.get<ParseResult>(
      `/cad/assets/${enc(assetId)}/parse?${new URLSearchParams({ command_id: parseCommandId })}`,
    )
    if (
      result.asset_id !== assetId ||
      result.command_id !== parseCommandId ||
      result.status !== 'parsed' ||
      !result.report_sha256
    )
      throw new Error('Stored parse reference is not a completed matching report')
    if (token !== this.selection) throw new Error('Selection changed during parse lookup')
    this.bindAsset(assetId, parseCommandId)
    this.state.parse = result
    return result
  }
  private async write<T>(pending: PendingCommand, path: string, reviewer?: string) {
    this.journal.begin(pending)
    try {
      return await this.api.post<T>(path, pending.request, reviewer)
    } catch (error) {
      this.recordCoreRejection(pending.command_id, error)
      throw error
    }
  }
  private recordCoreRejection(commandId: string, error: unknown) {
    if (
      error instanceof CoreHttpError &&
      error.code !== null &&
      error.status >= 400 &&
      error.status < 500
    )
      this.journal.amendPending(commandId, {
        rejected_status: error.status,
        rejected_code: error.code,
      })
  }
  discardRejectedPending() {
    const pending = this.journal.read().pending
    if (!pending?.rejected_status || pending.rejected_code === undefined)
      throw new Error('Only a definitive Core rejection can be discarded')
    this.journal.clearPending(pending.command_id)
  }

  async upload(file: File) {
    const sha256 = await digest(file)
    const command_id = this.commandId()
    if (this.journal.read().pending) throw new Error('Pending command must be resolved first')
    this.selection++
    this.journal.update({
      asset_id: undefined,
      parse_command_id: undefined,
      task_id: undefined,
      revision: undefined,
      run_id: undefined,
      nc_ref: undefined,
      unrecoverable: false,
    })
    this.state = { ncReady: false, unrecoverable: false }
    this.journal.begin({
      domain: 'upload',
      command_id,
      request: { filename: file.name, size_bytes: file.size, sha256 },
      expected_version: null,
    })
    return this.retryUpload(file)
  }
  async retryUpload(file: File) {
    const pending = this.journal.read().pending
    if (pending?.domain !== 'upload') throw new Error('No pending upload')
    if (
      file.name !== pending.request.filename ||
      file.size !== pending.request.size_bytes ||
      (await digest(file)) !== pending.request.sha256
    )
      throw new Error('Select the same upload file (name, size, SHA-256)')
    const token = this.selection
    let asset: Asset
    try {
      asset = await this.api.upload(file, pending.command_id)
    } catch (error) {
      this.recordCoreRejection(pending.command_id, error)
      throw error
    }
    if (asset.sha256 !== pending.request.sha256) throw new Error('Uploaded asset SHA-256 mismatch')
    if (token !== this.selection || this.journal.read().pending?.command_id !== pending.command_id)
      return asset
    this.journal.update({ asset_id: asset.asset_id })
    this.journal.clearPending(pending.command_id)
    this.state.asset = asset
    return asset
  }
  async parse(assetId = this.journal.read().asset_id) {
    if (!assetId) throw new Error('Missing CAD asset')
    if (this.journal.read().asset_id !== assetId) throw new Error('CAD asset selection changed')
    if (this.journal.read().pending) throw new Error('Pending command must be resolved first')
    const command_id = this.commandId()
    const token = this.selection
    this.journal.update({ parse_command_id: command_id })
    const result = await this.write<ParseResult>(
      {
        domain: 'parse',
        command_id,
        request: { command_id },
        expected_version: null,
        asset_id: assetId,
      },
      `/cad/assets/${enc(assetId)}/parse`,
    )
    if (token !== this.selection || this.journal.read().asset_id !== assetId) return result
    if (parseTerminal(result.status)) this.journal.clearPending(command_id)
    this.state.parse = result
    return result
  }
  async refreshParse(
    assetId = this.journal.read().asset_id,
    commandId = this.journal.read().parse_command_id,
  ) {
    if (!assetId || !commandId) throw new Error('Missing parse identity')
    const token = this.selection
    const generation = ++this.parseReadGeneration
    const result = await this.api.get<ParseResult>(
      `/cad/assets/${enc(assetId)}/parse?${new URLSearchParams({ command_id: commandId })}`,
    )
    if (result.asset_id !== assetId || result.command_id !== commandId)
      throw new Error('Parse identity mismatch')
    if (
      token !== this.selection ||
      generation !== this.parseReadGeneration ||
      this.journal.read().asset_id !== assetId
    )
      return result
    this.state.parse = result
    if (this.journal.read().pending?.domain === 'parse' && parseTerminal(result.status))
      this.journal.clearPending(commandId)
    return result
  }
  async createTask(payload: Record<string, unknown>, schemaVersion: string) {
    if (this.state.parse?.status !== 'parsed') throw new Error('CAD parse is not complete')
    const source = payload.source as Record<string, unknown> | undefined
    if (
      !source ||
      source.asset_id !== this.state.parse.asset_id ||
      source.parse_command_id !== this.state.parse.command_id ||
      source.sha256 !== this.state.parse.source_sha256
    )
      throw new Error('Task source does not match selected parsed asset')
    const command_id = this.commandId()
    const token = this.selection
    const request = { command_id, schema_version: schemaVersion, payload }
    const next = await this.write<Task>(
      {
        domain: 'task',
        command_id,
        request,
        expected_version: null,
        asset_id: this.journal.read().asset_id,
      },
      '/planning/tasks',
    )
    if (token !== this.selection) return next
    this.adoptTask(next.task_id, true)
    this.journal.clearPending(command_id)
    this.state.task = next
    return next
  }
  async replan(task: Task, parameterPatch?: Record<string, unknown>) {
    if (
      this.journal.read().task_id !== task.task_id ||
      this.journal.read().revision !== task.current_revision
    )
      throw new Error('Task selection or revision changed')
    const command_id = this.commandId()
    const token = this.selection
    const request = {
      command_id,
      base_revision: task.current_revision,
      expected_feedback_version: task.feedback_version,
      ...(parameterPatch ? { parameter_patch: parameterPatch } : {}),
    }
    const receipt = await this.write<PlanningRun>(
      {
        domain: 'replan',
        command_id,
        request,
        expected_version: task.current_revision,
        task_id: task.task_id,
      },
      `${taskPath(task.task_id)}/replan`,
    )
    if (!this.selected(token, task.task_id)) return receipt
    this.journal.amendPending(command_id, { run_id: receipt.run_id })
    this.state.planningRun = receipt
    this.state.card = undefined
    this.state.approved = undefined
    return receipt
  }
  async refreshPlanningRun(taskId: string, runId: string) {
    const token = this.selection
    const generation = ++this.planningReadGeneration
    const run = await this.api.get<PlanningRun>(`${taskPath(taskId)}/runs/${enc(runId)}`)
    if (run.run_id !== runId) throw new Error('Planning run identity mismatch')
    if (!this.selected(token, taskId) || generation !== this.planningReadGeneration) return run
    if (this.journal.read().task_id === taskId) this.state.planningRun = run
    if (terminal(run.status) && this.journal.read().pending?.run_id === runId)
      this.journal.clearPending(this.journal.read().pending!.command_id)
    return run
  }
  async refreshTask(taskId = this.journal.read().task_id) {
    if (!taskId) throw new Error('Missing task ID')
    const token = this.selection
    const generation = ++this.taskReadGeneration
    let next: Task
    try {
      next = await this.api.get<Task>(taskPath(taskId))
    } catch (error) {
      if (error instanceof CoreHttpError && error.status === 404 && error.code === 5001)
        throw new TaskUnavailableError('Core task missing', { cause: error })
      throw error
    }
    if (!this.selected(token, taskId) || generation !== this.taskReadGeneration) return next
    let details: Partial<State> = {}
    if (next.current_revision > 0) {
      const [rawPlan, card, approved, runs] = await Promise.all([
        this.api.get<unknown>(`${taskPath(taskId)}/results/${next.current_revision}`),
        this.api.get<Card>(cardPath(taskId, next.current_revision)),
        this.api.get<ApprovedPlans>(`/cam/tasks/${enc(taskId)}/approved-plans`),
        this.api.get<{ runs: CamRun[] }>(`/cam/tasks/${enc(taskId)}/runs`),
      ])
      const plan = parsePlanProduced(rawPlan)
      if (
        plan.task_id !== taskId ||
        plan.revision !== next.current_revision ||
        plan.result_id !== next.result_id
      )
        throw new Error('Planning result identity mismatch')
      details = {
        plan,
        card,
        approved,
        camRuns: runs.runs,
        configurationError: this.config ? undefined : 'Deployment configuration unavailable',
      }
      if (this.config) {
        try {
          details.integrationTemplate = matchIntegrationTemplate(this.config, plan)
        } catch (error) {
          details.configurationError = String(error)
        }
      }
    }
    if (this.selected(token, taskId) && generation === this.taskReadGeneration) {
      const revisionChanged =
        (this.state.task?.current_revision ?? this.journal.read().revision) !==
        next.current_revision
      this.journal.update({
        revision: next.current_revision,
        ...(revisionChanged ? { run_id: undefined, nc_ref: undefined } : {}),
      })
      if (revisionChanged) {
        this.ncReadGeneration++
        this.camReadGeneration++
        this.state = {
          ncReady: false,
          unrecoverable: false,
          asset: this.state.asset,
          parse: this.state.parse,
          task: next,
          ...details,
        }
      } else {
        this.state = { ...this.state, task: next, ...details }
        if (next.current_revision === 0) {
          this.state.plan = undefined
          this.state.card = undefined
          this.state.approved = undefined
          this.state.integrationTemplate = undefined
          this.state.configurationError = undefined
        }
      }
    }
    return next
  }
  async approveCard(task: Task, card: Card, reviewer: string) {
    const location = this.journal.read()
    if (location.pending) throw new Error('Pending command blocks card approval')
    if (this.hasDrafts(task.task_id, task.current_revision))
      throw new Error('Unsubmitted draft blocks card approval')
    if (
      location.task_id !== task.task_id ||
      location.revision !== task.current_revision ||
      card.status !== 'ready' ||
      !reviewer.trim()
    )
      throw new Error('Current ready card and reviewer required')
    const command_id = this.commandId()
    const request = {
      command_id,
      decision: 'approve',
      expected_feedback_version: card.expected_feedback_version,
    }
    const receipt = await this.write<unknown>(
      {
        domain: 'card',
        command_id,
        request,
        expected_version: card.expected_feedback_version,
        task_id: task.task_id,
        revision: task.current_revision,
        reviewer,
      },
      `${cardPath(task.task_id, task.current_revision)}/review`,
      reviewer,
    )
    this.journal.clearPending(command_id)
    await this.refreshTask(task.task_id)
    return receipt
  }
  executablePlan(task: Task, approved = this.state.approved): PlanRef | null {
    const location = this.journal.read()
    if (
      location.pending ||
      this.hasDrafts(task.task_id, task.current_revision) ||
      location.task_id !== task.task_id ||
      !approved?.execution_configured ||
      !approved.execution_profile_id
    )
      return null
    return (
      approved.plans.find(
        ({ plan_ref, profile_matches }) =>
          profile_matches &&
          plan_ref.task_id === task.task_id &&
          plan_ref.result_id === task.result_id &&
          plan_ref.revision === task.current_revision,
      )?.plan_ref ?? null
    )
  }
  async startCam(task: Task) {
    if (!this.config) throw new Error('Deployment configuration unavailable for CAM')
    if (this.journal.read().pending) throw new Error('Pending command blocks CAM start')
    const current = await this.refreshTask(task.task_id)
    if (current.current_revision !== task.current_revision || current.result_id !== task.result_id)
      throw new Error('Task revision changed before CAM start')
    if (!this.state.integrationTemplate)
      throw new Error(this.state.configurationError ?? 'Configuration template mismatch')
    const existing = await this.api.get<{ runs: CamRun[] }>(`/cam/tasks/${enc(task.task_id)}/runs`)
    if (
      existing.runs.some(
        (run) =>
          run.plan_ref?.task_id === task.task_id &&
          run.plan_ref.revision === task.current_revision &&
          ['accepted', 'running', 'awaiting_confirmation'].includes(run.status),
      )
    )
      throw new Error('CAM run is already active for this task revision')
    const approved = await this.api.get<ApprovedPlans>(
      `/cam/tasks/${enc(task.task_id)}/approved-plans`,
    )
    this.state.approved = approved
    if (approved.execution_profile_id !== this.state.integrationTemplate.execution_profile_id)
      throw new Error('Execution profile differs from deployment configuration')
    const plan_ref = this.executablePlan(task, approved)
    if (!plan_ref || !approved.execution_profile_id)
      throw new Error('No current executable approved plan')
    const command_id = this.commandId()
    const token = this.selection
    const request = {
      command_id,
      plan_ref,
      execution_profile_id: approved.execution_profile_id,
      expected_current_revision: task.current_revision,
    }
    const receipt = await this.write<{ context: { cam_run_id: string } }>(
      {
        domain: 'cam',
        command_id,
        request,
        expected_version: task.current_revision,
        task_id: task.task_id,
      },
      '/cam/runs',
    )
    if (!this.selected(token, task.task_id)) return receipt
    this.journal.update({ run_id: receipt.context.cam_run_id })
    this.journal.clearPending(command_id)
    return this.refreshCam(receipt.context.cam_run_id)
  }
  async refreshCam(runId = this.journal.read().run_id) {
    if (!runId) throw new Error('Missing CAM run ID')
    const token = this.selection
    const generation = ++this.camReadGeneration
    const run = await this.api.get<CamRun>(`/cam/runs/${enc(runId)}`)
    if (run.cam_run_id !== runId) throw new Error('CAM run identity mismatch')
    if (token !== this.selection || generation !== this.camReadGeneration) return run
    if (this.journal.read().task_id && run.plan_ref?.task_id !== this.journal.read().task_id)
      throw new Error('CAM run belongs to a different task')
    const task = this.state.task
    if (
      task &&
      (run.plan_ref?.task_id !== task.task_id ||
        run.plan_ref?.revision !== task.current_revision ||
        run.plan_ref?.result_id !== task.result_id)
    )
      throw new Error('CAM run plan identity mismatch')
    if (this.journal.read().run_id !== runId)
      this.journal.update({ run_id: runId, nc_ref: undefined })
    this.state.camRun = run
    this.ncReadGeneration++
    this.state.ncReady = false
    this.state.nc = undefined
    this.state.ncFiles = undefined
    if (run.current_candidate) {
      this.journal.update({ nc_ref: run.current_candidate })
      await this.loadNc(run.current_candidate)
    } else {
      this.journal.update({ nc_ref: undefined })
    }
    return run
  }
  async controlCam(action: 'observe' | 'reconcile') {
    const run = this.state.camRun
    if (!run || !run.allowed_actions.includes(action)) throw new Error(`${action} is not allowed`)
    const token = this.selection
    const next =
      action === 'observe'
        ? await this.api.observe(run.cam_run_id)
        : await this.api.reconcile(run.cam_run_id)
    if (this.selected(token) && this.journal.read().run_id === run.cam_run_id)
      this.state.camRun = next
    return next
  }
  async loadNc(ref: NcRef) {
    const token = this.selection
    const generation = ++this.ncReadGeneration
    this.state.ncReady = false
    this.state.nc = undefined
    this.state.ncFiles = undefined
    const version = parseNcVersion(await this.api.get<unknown>(ncPath(ref)))
    if (
      version.ref.cam_run_id !== ref.cam_run_id ||
      version.ref.version !== ref.version ||
      version.ref.content_digest !== ref.content_digest ||
      !Array.isArray(version.files) ||
      version.files.length === 0
    )
      throw new Error('NC version identity or file list invalid')
    const files = await Promise.all(
      version.files.map(async (item) => {
        const file = (await this.api.file(ref, item.file_id)) as NcFile
        if (
          file.file_id !== item.file_id ||
          file.filename !== item.filename ||
          file.encoding !== item.encoding ||
          file.sha256 !== item.sha256 ||
          file.setup_id !== item.setup_id ||
          file.sequence !== item.sequence ||
          file.size_bytes !== item.size_bytes ||
          typeof file.newline !== 'string' ||
          !file.newline ||
          typeof file.text !== 'string'
        )
          throw new Error('NC file is missing or mismatched')
        return file
      }),
    )
    if (
      token !== this.selection ||
      generation !== this.ncReadGeneration ||
      (this.journal.read().run_id && this.journal.read().run_id !== ref.cam_run_id)
    )
      throw new Error('NC selection changed during retrieval')
    this.state.nc = version
    this.state.ncFiles = files
    this.state.ncReady = true
    this.journal.update({ nc_ref: ref })
    return { version, files }
  }
  async recover() {
    const location = this.journal.read()
    if (location.unrecoverable) throw new Error('Core task unrecoverable after restart')
    if (location.asset_id && !location.task_id) {
      try {
        this.state.asset = await this.api.get<Asset>(`/cad/assets/${enc(location.asset_id)}`)
      } catch (error) {
        if (!(error instanceof CoreHttpError && error.status === 404)) throw error
      }
    }
    if (location.task_id) {
      try {
        await this.refreshTask(location.task_id)
        if (location.pending?.domain === 'replan' && location.pending.run_id)
          await this.refreshPlanningRun(location.task_id, location.pending.run_id)
      } catch (error) {
        if (error instanceof TaskUnavailableError) {
          this.journal.update({ unrecoverable: true })
          this.state.unrecoverable = true
          throw new Error('Core task unrecoverable after restart', { cause: error })
        }
        throw error
      }
    }
    if (location.asset_id && location.parse_command_id)
      await this.refreshParse(location.asset_id, location.parse_command_id)
    const currentRunId = this.journal.read().run_id
    if (currentRunId) await this.refreshCam(currentRunId)
    return this.snapshot()
  }
  async retryPending(reviewer?: string) {
    const pending = this.journal.read().pending
    if (!pending || pending.domain === 'upload')
      throw new Error('No retryable command; upload requires original file')
    const token = this.selection
    const path =
      pending.domain === 'parse'
        ? `/cad/assets/${enc(pending.asset_id!)}/parse`
        : pending.domain === 'task'
          ? '/planning/tasks'
          : pending.domain === 'replan'
            ? `${taskPath(pending.task_id!)}/replan`
            : pending.domain === 'card'
              ? `${cardPath(pending.task_id!, pending.revision!)}/review`
              : '/cam/runs'
    if (pending.domain === 'card' && reviewer && reviewer !== pending.reviewer)
      throw new Error('Original reviewer identity required for card retry')
    let result: unknown
    try {
      result = await this.api.post<unknown>(path, pending.request, pending.reviewer)
    } catch (error) {
      this.recordCoreRejection(pending.command_id, error)
      throw error
    }
    if (token !== this.selection || this.journal.read().pending?.command_id !== pending.command_id)
      return result
    if (pending.domain === 'parse') {
      this.journal.update({ parse_command_id: pending.command_id })
      this.state.parse = result as ParseResult
      if (parseTerminal((result as ParseResult).status))
        this.journal.clearPending(pending.command_id)
    } else if (pending.domain === 'task') {
      const task = result as Task
      if (!task.task_id) throw new Error('Task retry lacks task ID')
      this.adoptTask(task.task_id, true)
      this.state.task = task
      this.journal.clearPending(pending.command_id)
    } else if (pending.domain === 'replan') {
      const run = result as PlanningRun
      if (!run.run_id) throw new Error('Replan retry lacks run ID')
      this.journal.amendPending(pending.command_id, { run_id: run.run_id })
      this.state.planningRun = run
    } else if (pending.domain === 'card') {
      this.journal.clearPending(pending.command_id)
      await this.refreshTask(pending.task_id)
    } else {
      const runId = (result as { context?: { cam_run_id?: string } }).context?.cam_run_id
      if (!runId) throw new Error('CAM retry lacks run ID')
      this.journal.update({ run_id: runId })
      this.journal.clearPending(pending.command_id)
      await this.refreshCam(runId)
    }
    return result
  }
}

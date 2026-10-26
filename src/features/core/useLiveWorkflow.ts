import { useEffect, useRef, useState } from 'react'
import { CoreClient, CoreHttpError, cardPath, ncPath } from '../../api/core/client'
import type { ApprovedPlans, Asset, CamRun, ParseResult, Task } from '../../api/core/client'
import type {
  Card,
  Deployment,
  LiveNc,
  LivePlan,
  NcFile,
  PlanningRun,
} from '../../api/core/contracts'
import { goldenRequest, validateDeployment } from '../../api/core/golden'
import { parameterChanges, toProcessPlan } from '../../api/core/viewModel'
import type { PlanningSession } from '../process-planning/useWorkflowSession'

type State = {
  asset?: Asset
  parsed?: ParseResult
  task?: Task
  plan?: LivePlan
  card?: Card
  approved?: ApprovedPlans
  planning?: PlanningRun
  cam?: CamRun
  nc?: LiveNc
  files?: NcFile[]
  selectedFile?: string
  session?: PlanningSession
  deployment?: Deployment
  busy: boolean
  error: string
  status: string
}
const initial: State = { busy: false, error: '', status: '请选择并上传 STEP' }
const path = (task: Task) => `/planning/tasks/${encodeURIComponent(task.task_id)}`
const uuid = () => crypto.randomUUID()
const pause = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('已取消', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 800)
    signal.addEventListener('abort', abort, { once: true })
  })
type Context = { api: CoreClient; signal: AbortSignal; update: (patch: Partial<State>) => void }

export function useLiveWorkflow(file?: File) {
  const [state, setState] = useState<State>(initial)
  const [reviewer, setReviewer] = useState('')
  const [agentOpen, setAgentOpen] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const retry = useRef<((context: Context) => Promise<void>) | null>(null)
  const locked = useRef(false)
  useEffect(() => {
    controller.current?.abort()
    retry.current = null
    locked.current = false
    setState(initial)
    return () => controller.current?.abort()
  }, [file])

  async function act(work: (context: Context) => Promise<void>) {
    if (locked.current) return
    locked.current = true
    const abort = new AbortController()
    controller.current?.abort()
    controller.current = abort
    const signal = abort.signal
    const api = new CoreClient(import.meta.env.VITE_API_BASE_URL ?? '', (url, init) =>
      fetch(url, { ...init, signal }),
    )
    const update = (patch: Partial<State>) => {
      if (!signal.aborted) setState((s) => ({ ...s, ...patch }))
    }
    retry.current = work
    update({ busy: true, error: '' })
    try {
      await work({ api, signal, update })
      if (!signal.aborted) retry.current = null
    } catch (error) {
      if (
        !signal.aborted &&
        error instanceof CoreHttpError &&
        error.confirmed &&
        error.method === 'POST' &&
        error.status >= 400 &&
        error.status < 500
      ) {
        retry.current = null
        setState((s) => ({
          ...s,
          status: 'Core 已拒绝命令，请修正输入或核对当前版本',
          approved: undefined,
          session: s.session ? { ...s.session, resultViewed: true } : undefined,
        }))
      }
      update({ error: error instanceof Error ? error.message : 'Core 请求失败' })
    } finally {
      if (!signal.aborted) {
        locked.current = false
        update({ busy: false })
      }
    }
  }
  function updateSession(update: (session: PlanningSession) => PlanningSession) {
    if (locked.current || retry.current) return
    setState((s) => (s.session ? { ...s, session: update(s.session) } : s))
  }
  const dirty = Object.keys(state.session?.drafts ?? {}).length > 0
  const activeCam =
    !!state.cam && ['accepted', 'running', 'awaiting_confirmation'].includes(state.cam.status)
  const executable =
    !dirty &&
    !state.busy &&
    !state.error &&
    state.approved?.execution_configured &&
    state.plan?.payload.extensions.execution_ready &&
    !state.plan.payload.extensions.reference_only
      ? state.approved.plans.find(
          (p) =>
            p.profile_matches &&
            p.plan_ref.task_id === state.task?.task_id &&
            p.plan_ref.result_id === state.plan?.result_id &&
            p.plan_ref.revision === state.task?.current_revision,
        )
      : undefined

  function upload() {
    if (!file || state.busy || retry.current) return
    const command = uuid()
    void act(async ({ api, update }) => {
      update({ status: '正在上传 STEP' })
      const asset = await api.upload(file, command)
      if (asset.status !== 'not_parsed') throw new Error('上传回执状态不符合 Core 契约')
      update({ asset, status: '上传成功 · 尚未解析' })
    })
  }
  function parse() {
    const asset = state.asset
    if (!asset || state.busy || retry.current) return
    const command = uuid()
    let receipt: ParseResult | undefined
    void act(async ({ api, signal, update }) => {
      const url = `/cad/assets/${encodeURIComponent(asset.asset_id)}/parse`
      receipt ??= await api.post<ParseResult>(url, { command_id: command })
      for (;;) {
        signal.throwIfAborted()
        update({ parsed: receipt, status: `NX 解析 · ${receipt.status}` })
        if (receipt.status !== 'running') {
          if (receipt.status === 'failed')
            update({
              error:
                typeof receipt.diagnostic === 'string'
                  ? receipt.diagnostic
                  : 'NX 解析失败；请核对 Core 诊断后再试。',
            })
          return
        }
        await pause(signal)
        receipt = await api.get<ParseResult>(
          `${url}?${new URLSearchParams({ command_id: command })}`,
        )
      }
    })
  }

  async function readPlan(context: Context, task: Task, run: PlanningRun, deployment: Deployment) {
    const { api, signal, update } = context
    update({ planning: run })
    let current = await api.get<PlanningRun>(`${path(task)}/runs/${encodeURIComponent(run.run_id)}`)
    for (;;) {
      signal.throwIfAborted()
      update({
        planning: current,
        status:
          current.status === 'queued'
            ? '等待规划'
            : current.status === 'running'
              ? '规划中'
              : '结果校验或交付中',
      })
      if (current.status === 'failed' || current.status === 'cancelled') {
        update({
          status: current.status === 'failed' ? '规划失败' : '已取消',
          error: current.execution_error?.message ?? '',
        })
        return
      }
      if (current.delivery_state.frontend === 'failed') {
        update({
          status: '结果交付失败',
          error: current.delivery_error?.message ?? '结果交付失败，请核对 Core 交付状态。',
        })
        return
      }
      if (current.status === 'completed' && current.delivery_state.frontend === 'available') {
        if (!current.output_revision || current.needs_replan)
          throw new Error('规划已结束，但结果版本或校验状态尚未就绪')
        const nextTask = await api.get<Task>(path(task))
        const plan = await api.get<LivePlan>(`${path(task)}/results/${current.output_revision}`)
        if (
          plan.task_id !== task.task_id ||
          plan.run_id !== current.run_id ||
          plan.revision !== current.output_revision ||
          nextTask.current_revision !== plan.revision
        )
          throw new Error('规划结果身份已变化，请重新核对当前任务')
        const model = toProcessPlan(plan, deployment)
        const card = await api.get<Card>(cardPath(task.task_id, plan.revision))
        if (
          card.task_id !== task.task_id ||
          card.revision !== plan.revision ||
          card.result_id !== plan.result_id ||
          card.status !== 'ready' ||
          !card.card
        )
          throw new Error('工艺卡尚未就绪，不能解锁结果或审批')
        const approved = await api.get<ApprovedPlans>(
          `/cam/tasks/${encodeURIComponent(task.task_id)}/approved-plans`,
        )
        update({
          task: nextTask,
          plan,
          card,
          approved,
          status: '工艺方案已就绪',
          session: {
            taskKey: `${task.task_id}/${plan.revision}`,
            plan: model,
            selectedId: model.operations[0]?.id ?? null,
            view: 'steps',
            drafts: {},
            messages: [],
            input: '',
            startedAt: 0,
            resultViewed: false,
            contextRevision: plan.revision,
          },
        })
        return
      }
      await pause(signal)
      current = await api.get<PlanningRun>(
        `${path(task)}/runs/${encodeURIComponent(current.run_id)}`,
      )
    }
  }
  function createPlan() {
    if (!state.asset || state.parsed?.status !== 'parsed' || state.busy || retry.current) return
    const asset = state.asset,
      parsed = state.parsed
    const createCommand = uuid(),
      planCommand = uuid()
    let task: Task | undefined, run: PlanningRun | undefined, deployment: Deployment | undefined
    void act(async (context) => {
      const { api, signal, update } = context
      if (!deployment) {
        const response = await fetch(`${import.meta.env.BASE_URL}core-deployment.json`, {
          signal,
          cache: 'no-store',
        })
        if (!response.ok || !response.headers.get('Content-Type')?.includes('json'))
          throw new Error(
            '未发布固定 Golden 部署配置 core-deployment.json；请确认模板与 EngineeringBinding。',
          )
        deployment = validateDeployment(await response.json())
      }
      task ??= await api.post<Task>(
        '/planning/tasks',
        goldenRequest(deployment, asset, parsed, createCommand),
      )
      update({ task, deployment, status: '规划任务已创建' })
      run ??= await api.post<PlanningRun>(`${path(task)}/replan`, {
        command_id: planCommand,
        base_revision: task.current_revision,
        expected_feedback_version: task.feedback_version,
      })
      await readPlan(context, task, run, deployment)
    })
  }
  function submitParameters() {
    if (
      !state.task ||
      !state.plan ||
      !state.session ||
      !state.deployment ||
      state.busy ||
      retry.current ||
      activeCam
    )
      return
    const task = state.task,
      plan = state.plan,
      session = state.session,
      deployment = state.deployment
    let changes: ReturnType<typeof parameterChanges>
    try {
      changes = parameterChanges(session.plan, session.drafts)
    } catch (error) {
      setState((s) => ({ ...s, error: String(error) }))
      return
    }
    const command = uuid()
    let run: PlanningRun | undefined
    void act(async (context) => {
      if (!changes.length) {
        context.update({ session: { ...session, drafts: {} } })
        return
      }
      context.update({
        approved: undefined,
        card: undefined,
        cam: undefined,
        nc: undefined,
        files: undefined,
        status: '等待规划',
        session: { ...session, resultViewed: false },
      })
      run ??= await context.api.post<PlanningRun>(`${path(task)}/replan`, {
        command_id: command,
        base_revision: task.current_revision,
        expected_feedback_version: task.feedback_version,
        parameter_patch: {
          template_digest: plan.payload.extensions.template.digest,
          base_plan_digest: plan.payload.extensions.plan_digest,
          changes,
        },
      })
      await readPlan(context, task, run, deployment)
    })
  }
  function approvePlan() {
    if (!state.task || !state.card || dirty || !reviewer.trim() || state.busy || retry.current)
      return
    const task = state.task,
      card = state.card,
      command = uuid(),
      identity = reviewer.trim()
    let reviewed = false
    void act(async ({ api, update }) => {
      if (!reviewed) {
        await api.post(
          `${cardPath(task.task_id, task.current_revision)}/review`,
          {
            command_id: command,
            decision: 'approve',
            expected_feedback_version: card.expected_feedback_version,
          },
          identity,
        )
        reviewed = true
      }
      update({
        card: await api.get<Card>(cardPath(task.task_id, task.current_revision)),
        approved: await api.get<ApprovedPlans>(
          `/cam/tasks/${encodeURIComponent(task.task_id)}/approved-plans`,
        ),
        status: '已回读工艺审批与执行资格',
      })
    })
  }

  async function readNc({ api, update }: Context, cam: CamRun) {
    update({ nc: undefined, files: undefined })
    if (!cam.current_candidate) return
    const nc = await api.get<LiveNc>(ncPath(cam.current_candidate))
    if (
      nc.ref.cam_run_id !== cam.current_candidate.cam_run_id ||
      nc.ref.version !== cam.current_candidate.version ||
      nc.ref.content_digest !== cam.current_candidate.content_digest ||
      !nc.is_current_candidate ||
      nc.plan_ref.task_id !== state.task?.task_id ||
      nc.plan_ref.revision !== state.task?.current_revision ||
      nc.plan_ref.result_id !== state.plan?.result_id ||
      nc.plan_ref.archive_digest !== cam.plan_ref?.archive_digest ||
      !nc.files.length
    )
      throw new Error('NC 候选或工艺版本不匹配')
    const files: NcFile[] = []
    for (const file of [...nc.files].sort((a, b) => a.sequence - b.sequence)) {
      const body = await api.get<NcFile>(
        `${ncPath(nc.ref)}/file?${new URLSearchParams({ file_id: file.file_id })}`,
      )
      if (
        body.file_id !== file.file_id ||
        body.sha256 !== file.sha256 ||
        body.size_bytes !== file.size_bytes ||
        body.filename !== file.filename ||
        body.encoding !== file.encoding ||
        body.setup_id !== file.setup_id ||
        body.sequence !== file.sequence ||
        typeof body.text !== 'string' ||
        !body.text.trim()
      )
        throw new Error('NC 正文与清单不匹配，禁止审核')
      files.push(body)
    }
    update({ nc, files, selectedFile: files[0]?.file_id })
  }
  async function watchCam(context: Context, id: string) {
    const { api, signal, update } = context
    for (;;) {
      signal.throwIfAborted()
      let cam = await api.get<CamRun>(`/cam/runs/${encodeURIComponent(id)}`)
      if (
        cam.cam_run_id !== id ||
        cam.plan_ref?.task_id !== state.task?.task_id ||
        cam.plan_ref?.revision !== state.task?.current_revision
      )
        throw new Error('CAM 运行与当前任务修订不匹配')
      if (cam.allowed_actions.includes('observe') && ['accepted', 'running'].includes(cam.status))
        cam = await api.observe<CamRun>(id)
      update({ cam, status: `CAM · ${cam.status} / ${cam.phase}` })
      if (!['accepted', 'running'].includes(cam.status)) {
        if (cam.status === 'succeeded') await readNc(context, cam)
        return
      }
      await pause(signal)
    }
  }
  function startCam() {
    if (
      !executable ||
      !state.task ||
      !state.approved?.execution_profile_id ||
      retry.current ||
      state.cam
    )
      return
    const body = {
      command_id: uuid(),
      plan_ref: executable.plan_ref,
      execution_profile_id: state.approved.execution_profile_id,
      expected_current_revision: state.task.current_revision,
    }
    let runId: string | undefined
    void act(async (context) => {
      context.update({ nc: undefined, files: undefined, status: 'CAM 请求待确认' })
      runId ??= (await context.api.post<{ context: { cam_run_id: string } }>('/cam/runs', body))
        .context.cam_run_id
      await watchCam(context, runId)
    })
  }
  function refreshCam() {
    if (!state.cam || state.busy || retry.current) return
    const runId = state.cam.cam_run_id
    void act((context) => watchCam(context, runId))
  }
  function approveNc() {
    if (
      !state.nc ||
      !state.files ||
      !reviewer.trim() ||
      dirty ||
      state.busy ||
      retry.current ||
      !state.nc.allowed_actions.includes('review')
    )
      return
    const nc = state.nc,
      cam = state.cam!,
      command = uuid(),
      identity = reviewer.trim()
    let reviewed = false
    void act(async (context) => {
      if (!reviewed) {
        await context.api.post(
          `${ncPath(nc.ref)}/review`,
          { command_id: command, nc_ref: nc.ref, decision: 'approve' },
          identity,
        )
        reviewed = true
      }
      await readNc(context, cam)
    })
  }
  function download() {
    if (
      !state.nc ||
      state.nc.review_status !== 'approved' ||
      !state.nc.allowed_actions.includes('download') ||
      dirty ||
      state.busy ||
      retry.current
    )
      return
    const nc = state.nc
    void act(async ({ api }) => {
      const blob = await api.download(nc.ref)
      const url = URL.createObjectURL(blob),
        link = document.createElement('a')
      link.href = url
      link.download = `NC-${nc.ref.cam_run_id}-v${nc.ref.version}.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }
  return {
    ...state,
    reviewer,
    setReviewer,
    dirty,
    activeCam,
    executable,
    agentOpen,
    setAgentOpen,
    updateSession,
    upload,
    parse,
    createPlan,
    submitParameters,
    approvePlan,
    startCam,
    refreshCam,
    approveNc,
    download,
    canRetry: !!retry.current && !state.busy,
    retry: () => {
      if (retry.current) void act(retry.current)
    },
    selectFile: (selectedFile: string) => setState((s) => ({ ...s, selectedFile })),
    viewResult: () => updateSession((s) => ({ ...s, resultViewed: true })),
  }
}
export type LiveWorkflow = ReturnType<typeof useLiveWorkflow>

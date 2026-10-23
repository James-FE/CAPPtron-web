import { useState } from 'react'
import { goldenPlanningRequest } from '../../api/core/golden'
import { CoreClient, CoreHttpError, cardPath, ncPath } from '../../api/core/client'
import type {
  ApprovedPlans,
  Asset,
  CamRun,
  NcVersion,
  ParseResult,
  Plan,
  Task,
} from '../../api/core/client'

const api = new CoreClient(import.meta.env.VITE_API_BASE_URL ?? '')
const id = () => crypto.randomUUID()
const path = (task: Task) => `/planning/tasks/${encodeURIComponent(task.task_id)}`
export function useCoreWorkflow() {
  const [parameterDraft, setParameterDraft] = useState<{ version: string; value: string }>()
  const [asset, setAsset] = useState<Asset>()
  const [parse, setParse] = useState<ParseResult>()
  const [parseCommand, setParseCommand] = useState('')
  const [taskId, setTaskId] = useState('')
  const [task, setTask] = useState<Task>()
  const [plan, setPlan] = useState<Plan>()
  const [card, setCard] = useState<{
    status: string
    expected_feedback_version: number
    card: unknown
  }>()
  const [approved, setApproved] = useState<ApprovedPlans>()
  const [run, setRun] = useState<CamRun>()
  const [runs, setRuns] = useState<CamRun[]>([])
  const [nc, setNc] = useState<NcVersion>()
  const [files, setFiles] = useState<{ fileId: string; filename: string; text: string }[]>([])
  const [reviewer, setReviewer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<unknown>()
  type PendingPlan = { task_id: string; run_id?: string; body: Record<string, unknown> }
  const [planningRuns, setPlanningRuns] = useState<Record<string, PendingPlan>>({})
  const planningRun = planningRuns[task?.task_id ?? taskId]
  function storePending(pending: PendingPlan) {
    setPlanningRuns((current) => ({ ...current, [pending.task_id]: pending }))
  }
  async function replan(current: Task, body: Record<string, unknown>) {
    const pending = { task_id: current.task_id, body }
    storePending(pending)
    setApproved(undefined)
    setCard(undefined)
    setRun(undefined)
    setNc(undefined)
    setFiles([])
    try {
      const result = await api.post<{ run_id: string }>(`${path(current)}/replan`, body)
      storePending({ ...pending, run_id: result.run_id })
      return result
    } catch (error) {
      if (error instanceof CoreHttpError && error.status >= 400 && error.status < 500) {
        setPlanningRuns((entries) => {
          const next = { ...entries }
          delete next[current.task_id]
          return next
        })
        setTask(undefined)
        setPlan(undefined)
      }
      throw error
    }
  }
  async function act(work: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await work()
      return true
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  async function refreshTask(key: string) {
    setTask(undefined)
    setPlan(undefined)
    setCard(undefined)
    setApproved(undefined)
    setRuns([])
    setRun(undefined)
    setNc(undefined)
    setFiles([])
    let pending = planningRuns[key]
    if (pending) {
      if (!pending.run_id) {
        const recovered = await api
          .post<{ run_id: string }>(
            `/planning/tasks/${encodeURIComponent(key)}/replan`,
            pending.body,
          )
          .catch((error) => {
            if (error instanceof CoreHttpError && error.status >= 400 && error.status < 500) {
              setPlanningRuns((entries) => {
                const next = { ...entries }
                delete next[key]
                return next
              })
            }
            throw error
          })
        pending = { ...pending, run_id: recovered.run_id }
        storePending(pending)
      }
      const status = await api.get<{ status: string }>(
        `/planning/tasks/${encodeURIComponent(key)}/runs/${encodeURIComponent(pending.run_id!)}`,
      )
      if (['completed', 'failed', 'cancelled'].includes(status.status)) {
        setPlanningRuns((current) => {
          const next = { ...current }
          delete next[key]
          return next
        })
      }
    }
    // 先确认规划终态，再读取当前修订，避免把完成前的修订当作最新版本。
    const next = await api.get<Task>(`/planning/tasks/${encodeURIComponent(key)}`)
    const nextRuns = await api.get<{ runs: CamRun[] }>(`/cam/tasks/${encodeURIComponent(key)}/runs`)
    const nextPlan =
      next.current_revision > 0
        ? await api.get<Plan>(`${path(next)}/results/${next.current_revision}`)
        : undefined
    const nextCard =
      next.current_revision > 0
        ? await api.get<NonNullable<typeof card>>(cardPath(key, next.current_revision))
        : undefined
    const nextApproved =
      next.current_revision > 0
        ? await api.get<ApprovedPlans>(`/cam/tasks/${encodeURIComponent(key)}/approved-plans`)
        : undefined
    setTask(next)
    setTaskId(next.task_id)
    setRuns(nextRuns.runs)
    setPlan(nextPlan)
    setCard(nextCard)
    setApproved(nextApproved)
  }
  async function refreshRun(key: string) {
    setRun(undefined)
    setNc(undefined)
    setFiles([])
    const next = await api.observeRun(key)
    setRun(next)
    if (next.current_candidate) {
      const version = await api.get<NcVersion>(ncPath(next.current_candidate))
      if (!version.files.length) throw new Error('NC 版本没有可读取的程序文件。')
      const content = await Promise.all(
        version.files.map(async (file) => {
          const result = await api.file(version.ref, file.file_id)
          if (!result.text.trim()) throw new Error('NC 程序正文为空，不能审核。')
          return { fileId: file.file_id, filename: file.filename, text: result.text }
        }),
      )
      setFiles(content)
      setNc(version)
    }
  }
  const roughOperation = plan?.payload.operations.find(
    (op) => op.attributes.parameters?.rough_step !== undefined,
  )
  const draftVersion = `${task?.task_id}:${task?.current_revision}`
  const draftValue = parameterDraft?.version === draftVersion ? parameterDraft.value : undefined
  const draftChanged =
    draftValue !== undefined &&
    Number(draftValue) !== roughOperation?.attributes.parameters?.rough_step
  const executable =
    !draftChanged && !planningRun && approved?.execution_configured && approved.execution_profile_id
      ? approved.plans.find(
          (p) =>
            p.profile_matches &&
            p.plan_ref.task_id === task?.task_id &&
            p.plan_ref.revision === task?.current_revision,
        )
      : undefined

  function reset() {
    setParameterDraft(undefined)
    setAsset(undefined)
    setParse(undefined)
    setParseCommand('')
    setTaskId('')
    setTask(undefined)
    setPlan(undefined)
    setCard(undefined)
    setApproved(undefined)
    setRun(undefined)
    setRuns([])
    setNc(undefined)
    setFiles([])
    setReceipt(undefined)
    setError('')
  }
  const upload = (file: File) =>
    act(async () => {
      reset()
      setAsset(await api.upload(file, id()))
    })
  const parseAsset = () =>
    act(async () => {
      if (!asset) return
      const command = parseCommand || id()
      setParseCommand(command)
      setParse(await api.post(`/cad/assets/${asset.asset_id}/parse`, { command_id: command }))
    })
  const refreshParse = () =>
    act(async () => {
      if (asset && parseCommand)
        setParse(
          await api.get(
            `/cad/assets/${asset.asset_id}/parse?command_id=${encodeURIComponent(parseCommand)}`,
          ),
        )
    })
  const createTask = () =>
    act(async () => {
      if (!asset || parse?.status !== 'parsed') return
      const next = await api.post<Task>(
        '/planning/tasks',
        goldenPlanningRequest(asset, parse, id()),
      )
      setTaskId(next.task_id)
      await refreshTask(next.task_id)
    })
  const generate = () =>
    act(async () => {
      if (!task || planningRun) return
      setReceipt(
        await replan(task, {
          command_id: id(),
          base_revision: task.current_revision,
          expected_feedback_version: task.feedback_version,
        }),
      )
      await refreshTask(task.task_id)
    })
  const revise = (value: number) =>
    act(async () => {
      if (!task || !plan || !roughOperation || planningRun || !Number.isFinite(value) || value <= 0)
        return
      setReceipt(
        await replan(task, {
          command_id: id(),
          base_revision: task.current_revision,
          expected_feedback_version: task.feedback_version,
          parameter_patch: {
            template_digest: plan.payload.extensions.template.digest,
            base_plan_digest: plan.payload.extensions.plan_digest,
            changes: [
              { operation_id: roughOperation.id, parameter_id: 'rough_step', value, unit: 'mm' },
            ],
          },
        }),
      )
      await refreshTask(task.task_id)
    })
  const approvePlan = () =>
    act(async () => {
      if (!task || card?.status !== 'ready' || !reviewer.trim() || planningRun || draftChanged)
        return
      setReceipt(
        await api.post(
          `${cardPath(task.task_id, task.current_revision)}/review`,
          {
            command_id: id(),
            decision: 'approve',
            expected_feedback_version: card.expected_feedback_version,
          },
          reviewer,
        ),
      )
      await refreshTask(task.task_id)
    })
  const execute = () =>
    act(async () => {
      if (
        !executable ||
        !task ||
        !approved ||
        (run && ['accepted', 'running', 'awaiting_confirmation'].includes(run.status))
      )
        return
      const result = await api.post<{ context: { cam_run_id: string } }>('/cam/runs', {
        command_id: id(),
        plan_ref: executable.plan_ref,
        execution_profile_id: approved.execution_profile_id,
        expected_current_revision: task.current_revision,
      })
      setReceipt(result)
      await refreshRun(result.context.cam_run_id)
    })
  const reconcile = () =>
    act(async () => {
      if (!run?.allowed_actions.includes('reconcile')) return
      await api.post(`/cam/runs/${encodeURIComponent(run.cam_run_id)}/reconcile`, {})
      await refreshRun(run.cam_run_id)
    })
  const approveNc = () =>
    act(async () => {
      if (!nc?.allowed_actions.includes('review') || !reviewer.trim() || !run) return
      setReceipt(
        await api.post(
          `${ncPath(nc.ref)}/review`,
          { command_id: id(), nc_ref: nc.ref, decision: 'approve' },
          reviewer,
        ),
      )
      await refreshRun(run.cam_run_id)
    })
  const download = () =>
    act(async () => {
      if (!nc?.allowed_actions.includes('download')) return
      const url = URL.createObjectURL(await api.download(nc.ref))
      const link = document.createElement('a')
      link.href = url
      link.download = `NC-${nc.ref.cam_run_id}-v${nc.ref.version}.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  return {
    draftValue,
    draftChanged,
    setDraftValue: (value: string) => setParameterDraft({ version: draftVersion, value }),
    asset,
    parse,
    parseCommand,
    taskId,
    setTaskId,
    task,
    plan,
    card,
    approved,
    run,
    runs,
    nc,
    files,
    reviewer,
    setReviewer,
    busy,
    error,
    receipt,
    planningRun,
    roughOperation,
    executable,
    reset,
    upload,
    parseAsset,
    refreshParse,
    createTask,
    generate,
    revise,
    approvePlan,
    execute,
    reconcile,
    approveNc,
    download,
    refreshTask: () => act(() => refreshTask(taskId)),
    refreshRun: (key: string) => act(() => refreshRun(key)),
  }
}
export type CoreWorkflow = ReturnType<typeof useCoreWorkflow>

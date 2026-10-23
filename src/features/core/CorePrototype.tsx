import { ProgramEditor } from '../program-review/ProgramEditor'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CoreClient } from '../../api/core/client'
import { CoreWorkflow } from '../../api/core/workflow'
import { loadIntegrationConfig } from '../../api/core/integrationConfig'
import type { IntegrationConfig } from '../../api/core/integrationConfig'
import { toLiveProcessPlan } from '../../api/core/viewModel'
import type { WorkflowStage } from '../../app/WorkflowNavigation'
import type { ModelSelection } from '../model-input/modelInput'
import { ModelFilePicker } from '../model-input/ModelFilePicker'
import { OperationDetails } from '../process-planning/OperationDetails'
import type { DetailView } from '../process-planning/OperationDetails'
import { toPrototypePlan } from '../../api/core/prototypeAdapter'

const defaultApi = new CoreClient(import.meta.env.VITE_API_BASE_URL ?? '')
async function deploymentConfig() {
  const url = import.meta.env.VITE_CORE_INTEGRATION_CONFIG_URL
  const digest = import.meta.env.VITE_CORE_INTEGRATION_CONFIG_SHA256
  if (!url || !digest) throw new Error('尚未配置集成清单地址与 SHA-256，真实流程已阻塞。')
  return (await loadIntegrationConfig(url, digest)).config
}
const targetPart = {
  family: 'turning.ring',
  outer_diameter_mm: 41,
  inner_diameter_mm: 39,
  thickness_mm: 5,
  chamfer: {
    edge: 'cutoff_side_outer',
    width_mm: 0.2,
    angle_deg: 45,
    axial_side: 'negative_z',
    top_radius_mm: 0,
    bottom_radius_mm: 0,
  },
}

export function CorePrototype({
  stage,
  active = true,
  onNavigate,
  selection,
  onChoose,
  onFiles,
  onDemo,
  fileError = '',
  onSourceStatus,
  showParseReport = false,
  api = defaultApi,
  configLoader = deploymentConfig,
}: {
  stage: WorkflowStage
  active?: boolean
  onNavigate: (stage: WorkflowStage) => void
  selection: ModelSelection
  onChoose: () => void
  onFiles: (files: readonly File[]) => void
  onDemo: () => void
  fileError?: string
  onSourceStatus?: (status: string) => void
  showParseReport?: boolean
  api?: CoreClient
  configLoader?: () => Promise<IntegrationConfig>
}) {
  const [workflow, setWorkflow] = useState<CoreWorkflow>()
  const [config, setConfig] = useState<IntegrationConfig>()
  const [state, setState] = useState<ReturnType<CoreWorkflow['snapshot']>>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<DetailView>('steps')
  const [reviewer, setReviewer] = useState('')
  const [part, setPart] = useState(targetPart)
  const [taskId, setTaskId] = useState('')
  const activeRef = useRef(active)
  activeRef.current = active
  const navigate = useRef(onNavigate)
  navigate.current = onNavigate
  const uploadedFile = useRef<File | undefined>(undefined)
  const lock = useRef(false)
  const sync = useCallback((flow: CoreWorkflow) => setState({ ...flow.snapshot() }), [])
  const act = useCallback(
    async (flow: CoreWorkflow, work: () => Promise<unknown>) => {
      if (lock.current) return
      lock.current = true
      setBusy(true)
      setError('')
      try {
        await work()
      } catch (reason) {
        setError(String(reason))
      } finally {
        sync(flow)
        lock.current = false
        setBusy(false)
      }
    },
    [sync],
  )
  useEffect(() => {
    let active = true
    configLoader()
      .then(async (loaded) => {
        if (!active) return
        const flow = new CoreWorkflow(api, undefined, undefined, loaded)
        flow.location()
        setConfig(loaded)
        setWorkflow(flow)
        await act(flow, async () => {
          await flow.recover()
          if (activeRef.current && flow.location().task_id)
            navigate.current(flow.location().run_id ? 'review' : 'planning')
        })
      })
      .catch((reason) => {
        if (active) setError(String(reason))
      })
    return () => {
      active = false
    }
  }, [api, configLoader, attempt, act])
  useEffect(() => {
    if (!active || !workflow || error) return
    const timer = window.setInterval(() => {
      const location = workflow.location()
      const snapshot = workflow.snapshot()
      const parseRunning =
        location.parse_command_id &&
        !location.task_id &&
        snapshot.parse?.status !== 'parsed' &&
        snapshot.parse?.status !== 'failed'
      const planningRunning = location.pending?.domain === 'replan' && location.pending.run_id
      const camRunning = snapshot.camRun && ['accepted', 'running'].includes(snapshot.camRun.status)
      if (parseRunning || planningRunning || camRunning)
        void act(workflow, async () => {
          if (parseRunning) await workflow.refreshParse()
          if (planningRunning) {
            await workflow.refreshPlanningRun(location.task_id!, location.pending!.run_id!)
            await workflow.refreshTask()
          }
          if (camRunning) await workflow.refreshCam()
        })
    }, 2000)
    return () => window.clearInterval(timer)
  }, [workflow, error, act, active])
  const location = workflow?.location()
  const pending = location?.pending
  const baseBlocked = busy || !!pending || !workflow || !!state?.unrecoverable || !!error
  const localUnapplied = selection.kind === 'local' && selection.file !== uploadedFile.current
  const replacementBlocked = busy || !!pending || !workflow
  const blocked = baseBlocked || localUnapplied
  const task = state?.task
  const livePlan = state?.plan ? toLiveProcessPlan(state.plan) : undefined
  const plan = livePlan ? toPrototypePlan(livePlan, blocked) : undefined
  const operation = plan?.operations.find((op) => op.id === selectedId) ?? plan?.operations[0]
  const drafts = location?.drafts ?? {}
  const draftPrefix = task ? `${task.task_id}:${task.current_revision}:` : ''
  const currentDrafts = Object.entries(drafts).filter(([key]) => key.startsWith(draftPrefix))
  const ncCurrent = !!(
    !error &&
    !busy &&
    !localUnapplied &&
    state?.ncReady &&
    state.camRun?.status === 'completed' &&
    state.nc?.is_current_candidate &&
    task &&
    state.nc.plan_ref.task_id === task.task_id &&
    state.nc.plan_ref.revision === task.current_revision &&
    state.nc.plan_ref.result_id === task.result_id &&
    !pending &&
    !currentDrafts.length
  )
  const sourceStatus = localUnapplied
    ? '本地新选择 · 尚未上传'
    : state?.parse?.status === 'parsed'
      ? 'Core 已解析 · 制造准入待确认'
      : state?.asset
        ? `Core 已上传 ${state.asset.filename} · ${state.parse?.status ?? '尚未解析'}`
        : task
          ? 'Core 当前任务 · 输入来源以服务端为准'
          : '尚未上传或解析'
  useEffect(() => {
    onSourceStatus?.(sourceStatus)
  }, [onSourceStatus, sourceStatus])
  const controls = (
    <>
      {localUnapplied && (
        <p role="status">新选择的本地模型尚未上传。当前任务仍属于原输入，继续前请先上传新文件。</p>
      )}
      {busy && <p role="status">正在请求 Core…</p>}
      {error && <p role="alert">{error}</p>}
      {state?.configurationError && <p role="alert">{state.configurationError}</p>}
      {pending && <p role="status">请求结果待确认。请查询状态或使用原命令重试。</p>}
      <button
        className="button"
        disabled={busy}
        onClick={() =>
          workflow ? void act(workflow, () => workflow.recover()) : setAttempt(attempt + 1)
        }
      >
        刷新 / 恢复状态
      </button>
      {pending && (
        <button
          className="button"
          disabled={busy || (pending.domain === 'upload' && selection.kind !== 'local')}
          onClick={() =>
            void act(workflow!, () =>
              pending.domain === 'upload' && selection.kind === 'local'
                ? workflow!.retryUpload(selection.file).then((result) => {
                    uploadedFile.current = selection.file
                    return result
                  })
                : workflow!.retryPending(),
            )
          }
        >
          重试原命令
        </button>
      )}
      {pending?.rejected_status && (
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void act(workflow!, async () => {
              workflow!.discardRejectedPending()
              await workflow!.recover()
            })
          }
        >
          解除已拒绝命令并刷新
        </button>
      )}
    </>
  )
  return (
    <>
      {stage === 'input' && (
        <section className="model-input-page" aria-labelledby="model-input-title">
          <h2 id="model-input-title">模型输入</h2>
          <p className="page-subtitle">上传工序模型 / 设计文件 · Core 真实流程</p>
          <div className="model-input-columns">
            <ModelFilePicker
              selection={selection}
              error={fileError}
              sourceStatus={sourceStatus}
              onChoose={onChoose}
              onFiles={onFiles}
              onDemo={onDemo}
            />
            <section className="input-preparation">
              <h3>输入准备</h3>
              <p>
                模型 / 图纸：
                {state?.asset
                  ? `已上传 ${state.asset.filename}`
                  : location?.asset_id
                    ? 'Core 已接收输入'
                    : task
                      ? '当前任务输入以服务端为准'
                      : '待上传'}
              </p>
              <p>
                解析状态：
                {state?.parse?.status ??
                  (location?.parse_command_id ? '已有解析请求，请刷新查看报告' : '尚未解析')}
                ；解析不代表制造准入。
              </p>
              <button
                className="button"
                disabled={replacementBlocked || selection.kind !== 'local' || !!fileError}
                onClick={() =>
                  selection.kind === 'local' &&
                  void act(workflow!, async () => {
                    await workflow!.upload(selection.file)
                    uploadedFile.current = selection.file
                  })
                }
              >
                上传 STEP
              </button>
              <button
                className="button"
                disabled={blocked || !location?.asset_id || state?.parse?.status === 'parsed'}
                onClick={() => void act(workflow!, () => workflow!.parse())}
              >
                执行 NX 解析
              </button>
              <div className="preparation-items">
                <p>制造要求（人工目标声明，非解析测量）</p>
                {(
                  [
                    ['outer_diameter_mm', '外径'],
                    ['inner_diameter_mm', '内径'],
                    ['thickness_mm', '厚度'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="parameter-field">
                    <label htmlFor={`target-${key}`}>{label} (mm)</label>
                    <div className="parameter-value">
                      <input
                        id={`target-${key}`}
                        aria-label={`${label} (mm)`}
                        type="number"
                        min="0"
                        step="any"
                        value={part[key]}
                        disabled={busy}
                        onChange={(event) =>
                          setPart({ ...part, [key]: Number(event.target.value) })
                        }
                      />
                    </div>
                  </div>
                ))}
                <p>
                  目标材料：2024 铝合金；切断侧外缘倒角 C0.2×45°。声明不代表材料或几何已被验证。
                </p>
              </div>
              <button
                className="button primary-button"
                disabled={blocked || state?.parse?.status !== 'parsed'}
                onClick={() =>
                  void act(workflow!, async () => {
                    const parsed = state!.parse!
                    const matches = config!.templates.filter(
                      (entry) =>
                        entry.matching_evidence.step_sha256 === parsed.source_sha256 &&
                        entry.matching_evidence.report_sha256 === parsed.report_sha256,
                    )
                    if (matches.length !== 1)
                      throw new Error('解析证据与部署模板不唯一匹配，不能创建任务。')
                    if (
                      ![part.outer_diameter_mm, part.inner_diameter_mm, part.thickness_mm].every(
                        (value) => Number.isFinite(value) && value > 0,
                      )
                    )
                      throw new Error('尺寸必须为正数')
                    const next = await workflow!.createTask(
                      {
                        part,
                        template: matches[0]!.template,
                        source: {
                          asset_id: parsed.asset_id,
                          sha256: parsed.source_sha256,
                          parse_command_id: parsed.command_id,
                        },
                      },
                      'template-request-v1',
                    )
                    await workflow!.refreshTask(next.task_id)
                    if (activeRef.current) navigate.current('planning')
                  })
                }
              >
                创建工艺规划任务
              </button>
              {state?.parse && (
                <details open={showParseReport}>
                  <summary>解析报告</summary>
                  <pre>{JSON.stringify(state.parse, null, 2)}</pre>
                </details>
              )}
              {controls}
            </section>
          </div>
        </section>
      )}
      {stage === 'planning' && (
        <section className="process-planning-page" aria-labelledby="planning-title">
          <header className="planning-heading">
            <div>
              <h2 id="planning-title">工艺决策</h2>
              <p className="page-subtitle">工艺规划 · 参数推荐 · 生产资源匹配</p>
            </div>
            <details>
              <summary>恢复已有任务</summary>
              <label>
                恢复任务 ID{' '}
                <input value={taskId} onChange={(event) => setTaskId(event.target.value)} />
              </label>
              <button
                className="button"
                disabled={replacementBlocked || !taskId.trim()}
                onClick={() =>
                  void act(workflow!, async () => {
                    workflow!.selectTask(taskId.trim())
                    await workflow!.recover()
                  })
                }
              >
                读取任务
              </button>
            </details>
          </header>
          <p className="plan-source">
            {task
              ? `${livePlan?.partName ?? '工艺任务'} · 修订 ${task.current_revision}`
              : '尚无真实规划任务，请先上传并解析 STEP。'}
          </p>
          {plan ? (
            <div className="decision-columns">
              <aside className="planning-sidebar" aria-label="任务信息与工序">
                <div className="operation-sidebar-list">
                  <p className="list-heading">工序 · {plan.operations.length}</p>
                  <nav className="operation-list" aria-label="工序列表">
                    {plan.operations.map((op) => (
                      <button
                        className="button operation-button"
                        key={op.id}
                        aria-pressed={op.id === operation?.id}
                        onClick={() => setSelectedId(op.id)}
                      >
                        <span>{String(op.sequence).padStart(2, '0')}</span>
                        <span>{op.name}</span>
                      </button>
                    ))}
                  </nav>
                </div>
              </aside>
              {operation ? (
                <OperationDetails
                  plan={plan}
                  operation={operation}
                  view={detail}
                  onView={setDetail}
                  drafts={Object.fromEntries(
                    currentDrafts.map(([key, value]) => {
                      const [opId, paramId] = JSON.parse(key.slice(draftPrefix.length)) as [
                        string,
                        string,
                      ]
                      return [JSON.stringify([opId, 'parameters', paramId]), String(value)]
                    }),
                  )}
                  onDraft={(key, value) => {
                    const [opId, section, paramId] = JSON.parse(key) as [string, string, string]
                    const parameter = livePlan!.operations
                      .find((op) => op.id === opId)
                      ?.parameters.find((item) => item.id === paramId)
                    if (blocked || section !== 'parameters' || !parameter?.editable) return
                    const typed = parameter.allowedValues?.find((item) => String(item) === value)
                    if (typed === undefined) return
                    workflow!.setDraft(
                      task!.task_id,
                      task!.current_revision,
                      JSON.stringify([opId, paramId]),
                      typed,
                    )
                    sync(workflow!)
                  }}
                />
              ) : (
                <div className="planning-empty">当前方案没有工序</div>
              )}
            </div>
          ) : (
            <div className="planning-empty">
              <h3>暂无可用工艺方案</h3>
              <p>仅展示 Core 返回的当前修订；不会自动加载 Demo。</p>
            </div>
          )}
          <footer className="planning-actions">
            <div>
              {controls}
              {state?.planningRun && <p role="status">规划运行：{state.planningRun.status}</p>}
              <button
                className="button"
                disabled={blocked || !task}
                onClick={() =>
                  void act(workflow!, async () => {
                    await workflow!.replan(task!)
                    await workflow!.refreshTask()
                  })
                }
              >
                生成模板工艺
              </button>
              <button
                className="button"
                disabled={blocked || !task || !state?.plan || !currentDrafts.length}
                onClick={() =>
                  void act(workflow!, async () => {
                    const changes = currentDrafts.map(([key, value]) => {
                      const [operation_id, parameter_id] = JSON.parse(
                        key.slice(draftPrefix.length),
                      ) as [string, string]
                      const parameter = livePlan!.operations
                        .find((op) => op.id === operation_id)!
                        .parameters.find((item) => item.id === parameter_id)!
                      if (!parameter.editable || !parameter.allowedValues?.includes(value))
                        throw new Error('草稿字段已失效')
                      return { operation_id, parameter_id, value, unit: parameter.unit }
                    })
                    await workflow!.replan(task!, {
                      template_digest: (
                        state!.plan!.payload.extensions.template as { digest: string }
                      ).digest,
                      base_plan_digest: state!.plan!.payload.extensions.plan_digest,
                      changes,
                    })
                    workflow!.clearDrafts(task!.task_id, task!.current_revision)
                    await workflow!.refreshTask()
                  })
                }
              >
                提交参数修订
              </button>
              <button
                className="button"
                disabled={busy || !currentDrafts.length || !!pending}
                onClick={() => {
                  workflow!.clearDrafts(task!.task_id, task!.current_revision)
                  sync(workflow!)
                }}
              >
                放弃本修订草稿
              </button>
              <label>
                审核人{' '}
                <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} />
              </label>
              <button
                className="button"
                disabled={
                  blocked ||
                  !task ||
                  state?.card?.status !== 'ready' ||
                  !reviewer.trim() ||
                  !!currentDrafts.length
                }
                onClick={() =>
                  void act(workflow!, () => workflow!.approveCard(task!, state!.card!, reviewer))
                }
              >
                批准当前工艺卡
              </button>
              <p>工艺卡：{state?.card?.status ?? '未就绪'}。工艺批准不等于 NC 批准或加工安全。</p>
              <button
                className="button primary-button"
                disabled={
                  blocked || !task || !workflow?.executablePlan(task) || !state?.integrationTemplate
                }
                onClick={() =>
                  void act(workflow!, async () => {
                    await workflow!.startCam(task!)
                    if (activeRef.current) navigate.current('review')
                  })
                }
              >
                运行 Mastercam 并进入审核
              </button>
            </div>
          </footer>
        </section>
      )}
      {stage === 'review' && (
        <section className="program-review-page" aria-labelledby="review-title">
          <header className="review-heading">
            <h2 id="review-title">程序审核</h2>
            <p>Core 当前 NC 候选 · 人工 NC 审核与制造验收仍需单独完成</p>
          </header>
          {controls}
          <p>
            CAM：
            {state?.camRun
              ? `${state.camRun.cam_run_id} · ${state.camRun.status} / ${state.camRun.phase}`
              : '尚无运行'}
          </p>
          {state?.camRun?.error != null && (
            <pre role="alert">{JSON.stringify(state.camRun.error, null, 2)}</pre>
          )}
          {state?.camRuns
            ?.filter(
              (run) =>
                run.plan_ref.task_id === task?.task_id &&
                run.plan_ref.revision === task?.current_revision &&
                run.plan_ref.result_id === task?.result_id,
            )
            .map((run) => (
              <button
                key={run.cam_run_id}
                className="button"
                disabled={blocked}
                onClick={() => void act(workflow!, () => workflow!.refreshCam(run.cam_run_id))}
              >
                读取运行 {run.cam_run_id} · {run.status}
              </button>
            ))}
          {state?.camRun?.allowed_actions
            .filter((action) => action === 'observe' || action === 'reconcile')
            .map((action) => (
              <button
                className="button"
                key={action}
                disabled={blocked}
                onClick={() =>
                  void act(workflow!, async () => {
                    await workflow!.controlCam(action as 'observe' | 'reconcile')
                    await workflow!.refreshCam()
                  })
                }
              >
                {action === 'observe' ? '观察执行状态' : '核实执行结果'}
              </button>
            ))}
          {ncCurrent ? (
            <div className="program-panel">
              <div className="program-toolbar">
                <div>
                  <h3>
                    NC 版本 {state!.nc!.ref.version} · {state!.nc!.review_status}
                  </h3>
                  <p>当前候选的全部文件已读取，正文只读。</p>
                </div>
                <div className="program-tools">
                  <button className="button" disabled>
                    查看差异
                  </button>
                  <button className="button" disabled>
                    Agent 协同
                  </button>
                </div>
              </div>
              <div className="program-content">
                {state!.ncFiles!.map((file) => (
                  <ProgramEditor
                    key={file.file_id}
                    document={{
                      id: JSON.stringify([state!.nc!.ref, file.file_id]),
                      draftText: file.text,
                      revision: state!.nc!.ref.version,
                    }}
                    readOnly
                    ariaLabel={`NC 正文 ${file.filename}`}
                    onChange={() => {}}
                  />
                ))}
              </div>
              <footer className="program-actions">
                <div>
                  <p className="warning-text">人工 NC 审核与制造验收待完成。</p>
                  <p className="muted-text">NC 审核和下载尚未接线；当前只读。</p>
                </div>
                <div className="program-tools">
                  <button className="button" disabled>
                    暂存草稿
                  </button>
                  <button className="button primary-button" disabled>
                    确认可用
                  </button>
                  <button className="button" disabled>
                    下载程序草稿
                  </button>
                </div>
              </footer>
            </div>
          ) : (
            <div className="review-empty">
              <h3>暂无当前版本 NC</h3>
              <p>需等待当前工艺修订 CAM 完成，且全部 NC 文件读取成功。</p>
            </div>
          )}
        </section>
      )}
    </>
  )
}

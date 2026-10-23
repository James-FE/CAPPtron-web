import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CorePrototype } from './CorePrototype'

beforeEach(() => {
  vi.unstubAllGlobals()
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
    removeItem: (key: string) => entries.delete(key),
    clear: () => entries.clear(),
  })
})

describe('原型真实流程', () => {
  it('在原模型输入页选择文件，配置失败时保留错误且不伪造规划', async () => {
    const onFiles = vi.fn()
    render(
      <CorePrototype
        stage="input"
        onNavigate={vi.fn()}
        selection={{ kind: 'empty' }}
        onChoose={vi.fn()}
        onFiles={onFiles}
        onDemo={vi.fn()}
        configLoader={async () => {
          throw new Error('配置摘要不匹配')
        }}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('配置摘要不匹配')
    fireEvent.click(screen.getByRole('button', { name: '选择模型文件' }))
    expect(screen.getByRole('heading', { name: '模型输入' })).toBeInTheDocument()
    expect(screen.queryByText('Core 真实工作区')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上传 STEP' })).toBeDisabled()
  })
})

import { waitFor } from '@testing-library/react'
import { CoreClient } from '../../api/core/client'
import { CommandJournal } from '../../api/core/commandJournal'
import type { IntegrationConfig } from '../../api/core/integrationConfig'

const sha = 'a'.repeat(64)
const syntheticConfig: IntegrationConfig = {
  schema_version: 'frontend-integration.v1',
  templates: [
    {
      template: { id: 'synthetic', version: '1', digest: sha },
      execution_profile_id: 'profile',
      matching_evidence: { step_sha256: sha, report_sha256: sha, mcam_sha256: sha },
      operations: [
        {
          id: 'op-stable',
          sequence: 1,
          name: '合成工序',
          steps: [{ id: 'step-stable', sequence: 1, content: '合成工步' }],
          parameter_metadata: {},
        },
      ],
      parameter_rules: [],
    },
  ],
}
const loadSyntheticConfig = async () => syntheticConfig
function syntheticPlan(revision: number) {
  return {
    schema_version: 'template-plan-v1-integration',
    provider: 'template',
    event_id: 'event',
    task_id: 'task',
    result_id: `result-${revision}`,
    revision,
    run_id: 'planning',
    trace_id: 'trace',
    source_request_id: 'source',
    trigger_request_id: 'trigger',
    feedback_snapshot: { feedback_version: 0, items: [] },
    payload: {
      part: { name: '合成零件' },
      blank: {},
      resources: {},
      operations: [
        {
          id: 'op-stable',
          sequence: 1,
          name: '合成工序',
          steps: [{ id: 'step-stable', sequence: 1, content: '合成工步', attributes: {} }],
          attributes: {},
        },
      ],
      extensions: {
        template: syntheticConfig.templates[0]!.template,
        plan_digest: sha,
        reference_only: false,
        execution_ready: true,
        source_binding: 'integration_pending',
        preparation: {},
        applied_feedback_ids: [],
        engineering_status: 'pending',
        matching_evidence: syntheticConfig.templates[0]!.matching_evidence,
        parameter_rules: [],
      },
    },
  }
}
function fixture({
  missingFile = false,
  revision = 1,
  runRevision = revision,
  failTask = false,
  unrecoverable = false,
}: {
  missingFile?: boolean
  revision?: number
  runRevision?: number
  failTask?: boolean
  unrecoverable?: boolean
} = {}) {
  const ref = { cam_run_id: 'cam', version: 1, content_digest: sha }
  const planRef = {
    task_id: 'task',
    result_id: `result-${runRevision}`,
    revision: runRevision,
    archive_digest: sha,
  }
  const file = {
    file_id: 'setup/T.NC',
    filename: 'T.NC',
    setup_id: 'setup',
    sequence: 1,
    encoding: 'utf-8',
    sha256: sha,
    size_bytes: 3,
  }
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST' && String(url).includes('/cad/assets?'))
      return new Response(
        JSON.stringify({
          asset_id: 'asset',
          sha256: sha,
          filename: 'replacement.step',
          status: 'stored',
        }),
      )
    if (init?.method === 'POST') throw new Error('恢复不能发送写请求')
    const path = String(url).replace('http://synthetic', '')
    if (path.includes('/file?'))
      return new Response(
        JSON.stringify(
          missingFile
            ? { error: { code: 7000, message: '文件读取失败' } }
            : { ...file, newline: '\n', text: 'M30' },
        ),
        { status: missingFile ? 500 : 200 },
      )
    if (unrecoverable && path === '/planning/tasks/task')
      return new Response(JSON.stringify({ error: { code: 5001, message: 'task lost' } }), {
        status: 404,
      })
    const body =
      path === '/planning/tasks/task'
        ? failTask
          ? null
          : {
              task_id: 'task',
              result_id: `result-${revision}`,
              current_revision: revision,
              feedback_version: 0,
            }
        : path === `/planning/tasks/task/results/${revision}`
          ? syntheticPlan(revision)
          : path.includes('/process-cards/')
            ? { status: 'ready', expected_feedback_version: 0 }
            : path === '/cam/tasks/task/approved-plans'
              ? {
                  execution_configured: true,
                  execution_profile_id: 'profile',
                  plans: [
                    {
                      profile_matches: true,
                      plan_ref: { ...planRef, revision, result_id: `result-${revision}` },
                    },
                  ],
                }
              : path === '/cam/tasks/task/runs'
                ? { runs: [] }
                : path === '/cam/runs/cam'
                  ? {
                      cam_run_id: 'cam',
                      plan_ref: planRef,
                      status: 'completed',
                      phase: 'complete',
                      current_candidate: ref,
                      allowed_actions: [],
                    }
                  : path === '/cam/runs/cam/nc/versions/1'
                    ? {
                        ref,
                        plan_ref: planRef,
                        origin: 'cam_generated',
                        review_status: 'pending',
                        files: [file],
                        reviews: [],
                        root_run_id: 'cam',
                        is_current_candidate: true,
                        allowed_actions: ['review'],
                      }
                    : undefined
    if (!body) throw new Error(`读取失败 ${path}`)
    return new Response(JSON.stringify(body))
  })
  new CommandJournal(localStorage, 'http://synthetic').update({
    task_id: 'task',
    revision,
    run_id: 'cam',
  })
  return { api: new CoreClient('http://synthetic', fetcher), fetcher }
}
function props(api: CoreClient) {
  return {
    stage: 'review' as const,
    onNavigate: vi.fn(),
    selection: { kind: 'empty' as const },
    onChoose: vi.fn(),
    onFiles: vi.fn(),
    onDemo: vi.fn(),
    api,
    configLoader: loadSyntheticConfig,
  }
}

describe('原型恢复与当前 NC 的 HTTP 集成', () => {
  it('刷新后只查询持久化引用，完整读取当前 NC 才显示正文', async () => {
    localStorage.clear()
    const { api, fetcher } = fixture()
    render(<CorePrototype {...props(api)} />)
    expect(await screen.findByLabelText('NC 正文 T.NC')).toHaveTextContent('M30')
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('file_id=setup%2FT.NC'))).toBe(
      true,
    )
  })
  it('隐藏真实页面再返回会保留已上传文件绑定，不要求重复上传', async () => {
    const nativeCrypto = crypto
    vi.stubGlobal('crypto', {
      randomUUID: () => nativeCrypto.randomUUID(),
      subtle: { digest: async () => new Uint8Array(32).fill(170).buffer },
    })
    localStorage.clear()
    const { api, fetcher } = fixture()
    const file = new File(['STEP'], 'replacement.step')
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('STEP').buffer,
    })
    const selection = { kind: 'local' as const, file, extension: 'STEP' as const }
    const view = render(<CorePrototype {...props(api)} selection={selection} stage="input" />)
    await waitFor(() => expect(screen.getByRole('button', { name: '上传 STEP' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '上传 STEP' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '执行 NX 解析' })).toBeEnabled())
    expect(
      screen.getByText(/STEP · 4 B · Core 已上传 replacement.step · 尚未解析/),
    ).toBeInTheDocument()
    view.rerender(
      <CorePrototype {...props(api)} selection={selection} stage="input" active={false} />,
    )
    view.rerender(<CorePrototype {...props(api)} selection={selection} stage="input" active />)
    expect(screen.getByRole('button', { name: '执行 NX 解析' })).toBeEnabled()
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
  })
  it('Core 重启丢失旧任务后允许显式上传新输入，不自动写入或清除旧命令', async () => {
    const nativeCrypto = crypto
    vi.stubGlobal('crypto', {
      randomUUID: () => nativeCrypto.randomUUID(),
      subtle: { digest: async () => new Uint8Array(32).fill(170).buffer },
    })
    localStorage.clear()
    const { api, fetcher } = fixture({ unrecoverable: true })
    const file = new File(['STEP'], 'replacement.step')
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('STEP').buffer,
    })
    const selection = { kind: 'local' as const, file, extension: 'STEP' as const }
    render(<CorePrototype {...props(api)} selection={selection} stage="input" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('unrecoverable')
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
    expect(screen.getByRole('button', { name: '创建工艺规划任务' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '上传 STEP' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '上传 STEP' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '执行 NX 解析' })).toBeEnabled())
    expect(new CommandJournal(localStorage, api.base).read()).toMatchObject({
      asset_id: 'asset',
      unrecoverable: false,
    })
  })
  it('后台恢复完成不改变已切到演示或数据底座的阶段', async () => {
    localStorage.clear()
    const { api, fetcher } = fixture()
    const original = fetcher.getMockImplementation()!
    let finish!: () => void
    const deferred = new Promise<void>((resolve) => {
      finish = resolve
    })
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/planning/tasks/task')) await deferred
      return original(url, init)
    })
    const onNavigate = vi.fn()
    const view = render(<CorePrototype {...props(api)} onNavigate={onNavigate} />)
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    view.rerender(<CorePrototype {...props(api)} onNavigate={onNavigate} active={false} />)
    finish()
    expect(await screen.findByLabelText('NC 正文 T.NC')).toHaveTextContent('M30')
    expect(onNavigate).not.toHaveBeenCalled()
  })
  it('更换本地 STEP 后阻止继续使用旧任务和旧 NC，选择本身不发写请求', async () => {
    localStorage.clear()
    const { api, fetcher } = fixture()
    const view = render(<CorePrototype {...props(api)} />)
    expect(await screen.findByLabelText('NC 正文 T.NC')).toHaveTextContent('M30')
    const selection = {
      kind: 'local' as const,
      file: new File(['new STEP'], 'replacement.step'),
      extension: 'STEP' as const,
    }
    view.rerender(<CorePrototype {...props(api)} selection={selection} stage="planning" />)
    expect(screen.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '运行 Mastercam 并进入审核' })).toBeDisabled()
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
    view.rerender(<CorePrototype {...props(api)} selection={selection} />)
    expect(screen.queryByLabelText('NC 正文 T.NC')).not.toBeInTheDocument()
    view.rerender(<CorePrototype {...props(api)} selection={selection} stage="input" />)
    expect(screen.getByRole('button', { name: '创建工艺规划任务' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '执行 NX 解析' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '上传 STEP' })).toBeEnabled()
  })
  it('任何 NC 文件读取失败都不显示不完整候选', async () => {
    localStorage.clear()
    const { api } = fixture({ missingFile: true })
    render(<CorePrototype {...props(api)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('文件读取失败')
    expect(screen.queryByLabelText('NC 正文 T.NC')).not.toBeInTheDocument()
  })
  it('恢复后不展示旧工艺修订的 NC', async () => {
    localStorage.clear()
    const { api } = fixture({ revision: 2, runRevision: 1 })
    render(<CorePrototype {...props(api)} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('CAM run plan identity mismatch')
    expect(screen.queryByLabelText('NC 正文 T.NC')).not.toBeInTheDocument()
  })
  it('恢复任务读取失败时审核与生成保持阻塞', async () => {
    localStorage.clear()
    const { api } = fixture({ failTask: true })
    render(<CorePrototype {...props(api)} stage="planning" />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('读取失败'))
    expect(screen.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '运行 Mastercam 并进入审核' })).toBeDisabled()
  })
})

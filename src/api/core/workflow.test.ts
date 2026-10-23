import { describe, expect, it, vi } from 'vitest'
import { CoreClient, CoreHttpError } from './client'
import { CommandJournal } from './commandJournal'
import { CoreWorkflow } from './workflow'
import type { IntegrationConfig } from './integrationConfig'

const sha = 'a'.repeat(64)
const disk = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
  }
}
const task = { task_id: 'task-1', current_revision: 1, feedback_version: 0, result_id: 'result-1' }
const plan = {
  schema_version: 'template-plan-v1-integration',
  provider: 'template',
  event_id: 'event-1',
  task_id: 'task-1',
  result_id: 'result-1',
  revision: 1,
  run_id: 'plan-run-1',
  trace_id: 'trace-1',
  source_request_id: 'source-1',
  trigger_request_id: 'trigger-1',
  feedback_snapshot: { feedback_version: 0, items: [] },
  payload: {
    part: {},
    blank: {},
    resources: {},
    operations: [],
    extensions: {
      template: { id: 'template-1', version: '1.0', digest: sha },
      plan_digest: sha,
      reference_only: false,
      execution_ready: true,
      source_binding: 'integration_pending',
      preparation: {},
      applied_feedback_ids: [],
      engineering_status: 'pending',
      matching_evidence: { step_sha256: sha, report_sha256: sha, mcam_sha256: sha },
      parameter_rules: [],
    },
  },
}
const card = { status: 'ready', expected_feedback_version: 0 }
const approved = {
  execution_configured: true,
  execution_profile_id: 'profile-1',
  plans: [
    {
      profile_matches: true,
      plan_ref: { task_id: 'task-1', result_id: 'result-1', revision: 1, archive_digest: sha },
    },
  ],
}
const config: IntegrationConfig = {
  schema_version: 'frontend-integration.v1',
  templates: [
    {
      template: { id: 'template-1', version: '1.0', digest: sha },
      execution_profile_id: 'profile-1',
      matching_evidence: { step_sha256: sha, report_sha256: sha, mcam_sha256: sha },
      operations: [],
      parameter_rules: [],
    },
  ],
}
const ncVersion = {
  ref: { cam_run_id: 'run-1', version: 1, content_digest: sha },
  plan_ref: approved.plans[0]!.plan_ref,
  origin: 'cam_generated',
  parent: null,
  review_status: 'pending',
  files: [
    {
      file_id: 'one',
      filename: 'one',
      setup_id: 'setup',
      sequence: 1,
      encoding: 'utf-8',
      sha256: sha,
      size_bytes: 2,
    },
  ],
  reviews: [],
  feedback_id: null,
  simulation_version: null,
  comparison_sha256: null,
  root_run_id: 'run-1',
  is_current_candidate: true,
  allowed_actions: ['review'],
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
function taskRead(url: string) {
  if (url === '/planning/tasks/task-1') return json(task)
  if (url === '/planning/tasks/task-1/results/1') return json(plan)
  if (url === '/process-cards/tasks/id_dGFzay0x/results/1') return json(card)
  if (url === '/cam/tasks/task-1/approved-plans') return json(approved)
  return null
}
function setup(fetcher: ReturnType<typeof vi.fn>, store = disk(), integration?: IntegrationConfig) {
  const journal = new CommandJournal(store)
  return {
    flow: new CoreWorkflow(
      new CoreClient('', fetcher as typeof fetch),
      journal,
      () => 'command-1',
      integration,
    ),
    journal,
    store,
  }
}

describe('CoreWorkflow recovery', () => {
  it('reload uses GET and does not duplicate lost parse or CAM starts', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('/parse?'))
        return json({
          command_id: 'parse-1',
          asset_id: sha,
          source_sha256: sha,
          status: 'parsed',
          report_sha256: sha,
        })
      if (url === '/planning/tasks/task-1') return json(task)
      if (url === '/process-cards/tasks/id_dGFzay0x/results/1') return json(card)
      if (url === '/cam/tasks/task-1/approved-plans') return json(approved)
      if (url === '/cam/tasks/task-1/runs') return json({ runs: [] })
      if (url === '/planning/tasks/task-1/results/1') return json(plan)
      throw new Error(url)
    })
    const { journal, store } = setup(fetcher)
    journal.update({ asset_id: sha, parse_command_id: 'parse-1', task_id: 'task-1', revision: 1 })
    journal.begin({
      domain: 'cam',
      command_id: 'cam-1',
      request: {
        command_id: 'cam-1',
        plan_ref: approved.plans[0]!.plan_ref,
        execution_profile_id: 'profile-1',
        expected_current_revision: 1,
      },
      expected_version: 1,
      task_id: 'task-1',
    })
    await new CoreWorkflow(
      new CoreClient('', fetcher as typeof fetch),
      new CommandJournal(store),
    ).recover()
    expect(
      (fetcher.mock.calls as unknown as [string, RequestInit?][]).every((call) => !call[1]?.method),
    ).toBe(true)
    expect(new CommandJournal(store).read().pending?.command_id).toBe('cam-1')
  })

  it('pending replan and draft block card approval', async () => {
    const fetcher = vi.fn()
    const { flow, journal, store } = setup(fetcher)
    journal.update({ task_id: task.task_id, revision: 1 })
    journal.begin({
      domain: 'replan',
      command_id: 'replan-1',
      request: { command_id: 'replan-1', base_revision: 1, expected_feedback_version: 0 },
      expected_version: 1,
      task_id: task.task_id,
    })
    await expect(flow.approveCard(task, card, 'reviewer')).rejects.toThrow(/pending/i)
    expect(fetcher).not.toHaveBeenCalled()
    journal.clearPending('replan-1')
    flow.setDraft('task-1', 1, 'rough_step', 0.4)
    await expect(flow.approveCard(task, card, 'reviewer')).rejects.toThrow(/draft/i)
    const reloaded = new CoreWorkflow(
      new CoreClient('', fetcher as typeof fetch),
      new CommandJournal(store),
    )
    await expect(reloaded.approveCard(task, card, 'reviewer')).rejects.toThrow(/draft/i)
  })

  it('409 retains the original expected version and command for deliberate retry', async () => {
    const fetcher = vi.fn(async () => json({ error: { code: 409, message: 'conflict' } }, 409))
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: task.task_id, revision: 1 })
    await expect(flow.replan(task)).rejects.toBeInstanceOf(CoreHttpError)
    expect(journal.read().pending?.request).toMatchObject({
      base_revision: 1,
      expected_feedback_version: 0,
      command_id: 'command-1',
    })
    expect(journal.read().pending?.rejected_status).toBe(409)
    flow.discardRejectedPending()
    expect(journal.read().pending).toBeUndefined()
  })

  it('does not treat a proxy 409 page as a definitive Core rejection', async () => {
    const fetcher = vi.fn(async () => new Response('proxy conflict', { status: 409 }))
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'task-1', revision: 1 })
    await expect(flow.replan(task)).rejects.toBeInstanceOf(CoreHttpError)
    expect(journal.read().pending?.rejected_status).toBeUndefined()
    expect(() => flow.discardRejectedPending()).toThrow(/definitive/i)
  })

  it('late response cannot replace a newly selected task', async () => {
    let reply!: (response: Response) => void
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve
        }),
    )
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'task-1' })
    const pending = flow.refreshTask('task-1')
    journal.update({ task_id: 'task-2' })
    reply(json(task))
    await pending
    expect(flow.snapshot().task?.task_id).not.toBe('task-1')
  })

  it('late rev1 task GET cannot overwrite a completed rev2 refresh for the same task', async () => {
    let releaseFirst!: (value: Response) => void
    let taskGets = 0
    const rev2 = { ...task, current_revision: 2 }
    const plan2 = { ...plan, revision: 2 }
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/planning/tasks/task-1') {
        taskGets++
        if (taskGets === 1)
          return new Promise<Response>((resolve) => {
            releaseFirst = resolve
          })
        return json(rev2)
      }
      if (url === '/planning/tasks/task-1/results/2') return json(plan2)
      if (url === '/process-cards/tasks/id_dGFzay0x/results/2') return json(card)
      if (url === '/cam/tasks/task-1/approved-plans') return json(approved)
      if (url === '/cam/tasks/task-1/runs') return json({ runs: [] })
      throw new Error(url)
    })
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'task-1' })
    const old = flow.refreshTask('task-1')
    await flow.refreshTask('task-1')
    releaseFirst(json(task))
    await old
    expect(flow.snapshot().task?.current_revision).toBe(2)
    expect(flow.snapshot().plan?.revision).toBe(2)
    expect(journal.read().revision).toBe(2)
  })

  it('failed rev2 card read leaves the complete rev1 snapshot and journal together', async () => {
    let revision = 1
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/planning/tasks/task-1') return json({ ...task, current_revision: revision })
      if (url === '/planning/tasks/task-1/results/1') return json(plan)
      if (url === '/planning/tasks/task-1/results/2') return json({ ...plan, revision: 2 })
      if (url === '/process-cards/tasks/id_dGFzay0x/results/1') return json(card)
      if (url === '/process-cards/tasks/id_dGFzay0x/results/2')
        return json({ error: { code: 5031, message: 'unavailable' } }, 503)
      if (url === '/cam/tasks/task-1/approved-plans') return json(approved)
      return json({ runs: [] })
    })
    const { flow, journal } = setup(fetcher, disk(), config)
    journal.update({ task_id: 'task-1', revision: 1 })
    await flow.refreshTask('task-1')
    revision = 2
    await expect(flow.refreshTask('task-1')).rejects.toBeInstanceOf(CoreHttpError)
    expect(flow.snapshot().task?.current_revision).toBe(1)
    expect(flow.snapshot().plan?.revision).toBe(1)
    expect(flow.snapshot().integrationTemplate?.execution_profile_id).toBe('profile-1')
    expect(journal.read().revision).toBe(1)
  })

  it('lost upload needs matching file name, size and checksum', async () => {
    const fetcher = vi.fn(async () =>
      json({ asset_id: sha, sha256: sha, filename: 'a.step', status: 'not_parsed' }),
    )
    const { flow, journal } = setup(fetcher)
    journal.begin({
      domain: 'upload',
      command_id: 'upload-1',
      request: { filename: 'a.step', size_bytes: 3, sha256: sha },
      expected_version: null,
    })
    await expect(flow.retryUpload(new File(['no'], 'a.step'))).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('Core task 404 becomes unrecoverable', async () => {
    const fetcher = vi.fn(async () => json({ error: { code: 5001, message: 'missing' } }, 404))
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'task-1' })
    await expect(flow.recover()).rejects.toThrow(/unrecoverable/i)
    expect(journal.read().unrecoverable).toBe(true)
  })

  it('checks the task before an old parse reference when Core was restarted', async () => {
    const fetcher = vi.fn(async () => json({ error: { code: 5001, message: 'missing' } }, 404))
    const { flow, journal } = setup(fetcher)
    journal.update({ asset_id: sha, parse_command_id: 'parse-1', task_id: 'task-1' })
    await expect(flow.recover()).rejects.toThrow(/unrecoverable/i)
    expect((fetcher.mock.calls as unknown as [string][])[0]![0]).toBe('/planning/tasks/task-1')
  })

  it('proxy HTML 404 does not permanently mark a Core task unrecoverable', async () => {
    let first = true
    const fetcher = vi.fn(async (url: string) => {
      if (first) {
        first = false
        return new Response('<h1>proxy missing</h1>', {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        })
      }
      return taskRead(url) ?? json({ runs: [] })
    })
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'task-1' })
    await expect(flow.recover()).rejects.toBeInstanceOf(CoreHttpError)
    expect(journal.read().unrecoverable).not.toBe(true)
    await flow.recover()
    expect(flow.snapshot().task?.task_id).toBe('task-1')
  })

  it('does not mark NC ready when file retrieval is incomplete', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('/file?file_id=one') ? json({ text: 'NC' }) : json(ncVersion),
    )
    const { flow } = setup(fetcher)
    await expect(
      flow.loadNc({ cam_run_id: 'run-1', version: 1, content_digest: sha }),
    ).rejects.toThrow()
    expect(flow.snapshot().ncReady).toBe(false)
  })

  it('marks a complete legal NC version ready with each original file kept separate', async () => {
    const file = { ...ncVersion.files[0], newline: 'LF', text: 'NC' }
    const fetcher = vi.fn(async (url: string) =>
      url.includes('/file?') ? json(file) : json(ncVersion),
    )
    const { flow } = setup(fetcher)
    await flow.loadNc(ncVersion.ref)
    expect(flow.snapshot().ncReady).toBe(true)
    expect(flow.snapshot().ncFiles).toEqual([file])
  })

  it('late NC version 1 read cannot overwrite a completed version 2 read', async () => {
    let releaseFirst!: (value: Response) => void
    const ref2 = { ...ncVersion.ref, version: 2 }
    const version2 = { ...ncVersion, ref: ref2 }
    const file = { ...ncVersion.files[0], newline: 'LF', text: 'NC' }
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('/versions/1') && !url.includes('/file?'))
        return new Promise<Response>((resolve) => {
          releaseFirst = resolve
        })
      if (url.includes('/versions/2') && !url.includes('/file?')) return json(version2)
      return json(file)
    })
    const { flow, journal } = setup(fetcher)
    const old = flow.loadNc(ncVersion.ref)
    await flow.loadNc(ref2)
    releaseFirst(json(ncVersion))
    await expect(old).rejects.toThrow(/selection changed/i)
    expect(flow.snapshot().nc?.ref.version).toBe(2)
    expect(journal.read().nc_ref?.version).toBe(2)
  })

  it('new CAM run without candidate clears the previous run NC and file state', async () => {
    const file = { ...ncVersion.files[0], newline: 'LF', text: 'NC' }
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/cam/runs/run-2')
        return json({
          cam_run_id: 'run-2',
          plan_ref: approved.plans[0]!.plan_ref,
          status: 'accepted',
          phase: 'prepare',
          current_candidate: null,
          allowed_actions: [],
        })
      if (url.includes('/file?')) return json(file)
      return json(ncVersion)
    })
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'task-1', run_id: 'run-1' })
    await flow.loadNc(ncVersion.ref)
    expect(flow.snapshot().ncReady).toBe(true)
    await flow.refreshCam('run-2')
    expect(flow.snapshot().ncReady).toBe(false)
    expect(flow.snapshot().ncFiles).toBeUndefined()
    expect(journal.read().nc_ref).toBeUndefined()
    expect(journal.read().run_id).toBe('run-2')
  })

  it('storage failure prevents the replan write', async () => {
    const fetcher = vi.fn()
    const store = {
      getItem: () => JSON.stringify({ task_id: 'task-1', revision: 1 }),
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    const flow = new CoreWorkflow(
      new CoreClient('', fetcher as typeof fetch),
      new CommandJournal(store),
    )
    await expect(flow.replan(task)).rejects.toThrow(/quota/)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('parse running remains pending and blocks a second parse after reload', async () => {
    const fetcher = vi.fn(async () =>
      json({ asset_id: sha, source_sha256: sha, command_id: 'command-1', status: 'running' }),
    )
    const { flow, journal, store } = setup(fetcher)
    journal.update({ asset_id: sha })
    await flow.parse()
    expect(journal.read().pending?.domain).toBe('parse')
    const reloaded = new CoreWorkflow(
      new CoreClient('', fetcher as typeof fetch),
      new CommandJournal(store),
    )
    await expect(reloaded.parse()).rejects.toThrow(/pending/i)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('unknown upload stays unresolved on reload and requires the same file bytes', async () => {
    const fetcher = vi.fn()
    const { flow, journal, store } = setup(fetcher)
    journal.begin({
      domain: 'upload',
      command_id: 'upload-1',
      request: {
        filename: 'a.step',
        size_bytes: 3,
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      },
      expected_version: null,
    })
    await flow.recover()
    expect(fetcher).not.toHaveBeenCalled()
    const reloaded = new CoreWorkflow(
      new CoreClient('', fetcher as typeof fetch),
      new CommandJournal(store),
    )
    await expect(
      reloaded.retryUpload({
        name: 'a.step',
        size: 3,
        arrayBuffer: async () => new TextEncoder().encode('xyz').buffer,
      } as File),
    ).rejects.toThrow(/same upload file/i)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('retrying a matching upload keeps the original command ID', async () => {
    const originalSha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    const fetcher = vi.fn(async () =>
      json({
        asset_id: 'asset-1',
        sha256: originalSha,
        filename: 'a.step',
        size_bytes: 3,
        status: 'not_parsed',
      }),
    )
    const { flow, journal } = setup(fetcher)
    journal.begin({
      domain: 'upload',
      command_id: 'upload-1',
      request: { filename: 'a.step', size_bytes: 3, sha256: originalSha },
      expected_version: null,
    })
    const original = {
      name: 'a.step',
      size: 3,
      arrayBuffer: async () => new TextEncoder().encode('abc').buffer,
    } as File
    await flow.retryUpload(original)
    expect((fetcher.mock.calls as unknown as [string][])[0]![0]).toContain('command_id=upload-1')
    expect(journal.read().pending).toBeUndefined()
  })

  it('same command cannot be retried with a different reviewer', async () => {
    const fetcher = vi.fn()
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'task-1', revision: 1 })
    journal.begin({
      domain: 'card',
      command_id: 'card-1',
      request: { command_id: 'card-1', decision: 'approve', expected_feedback_version: 0 },
      expected_version: 0,
      task_id: 'task-1',
      revision: 1,
      reviewer: 'reviewer-a',
    })
    await expect(flow.retryPending('reviewer-b')).rejects.toThrow(/Original reviewer/i)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('pending CAM for task A blocks selection of B and retries only the original command', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url === '/cam/runs'
        ? json({ context: { cam_run_id: 'run-a' }, command_id: 'cam-a', kind: 'generate' })
        : json({
            cam_run_id: 'run-a',
            plan_ref: approved.plans[0]!.plan_ref,
            status: 'running',
            phase: 'prepare',
            current_candidate: null,
            allowed_actions: [],
          }),
    )
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'task-1', revision: 1 })
    journal.begin({
      domain: 'cam',
      command_id: 'cam-a',
      request: {
        command_id: 'cam-a',
        plan_ref: approved.plans[0]!.plan_ref,
        execution_profile_id: 'profile-1',
        expected_current_revision: 1,
      },
      expected_version: 1,
      task_id: 'task-1',
    })
    expect(() => flow.selectTask('task-b')).toThrow(/pending/i)
    expect(journal.read().task_id).toBe('task-1')
    await flow.retryPending()
    expect(journal.read().run_id).toBe('run-a')
    expect(journal.read().pending).toBeUndefined()
    expect(
      JSON.parse(String((fetcher.mock.calls as unknown as [string, RequestInit?][])[0]![1]?.body))
        .command_id,
    ).toBe('cam-a')
  })

  it('known active CAM run blocks duplicate start after receipt recovery', async () => {
    const fetcher = vi.fn(
      async (url: string) =>
        taskRead(url) ??
        (url.endsWith('/runs')
          ? json({
              runs: [
                { cam_run_id: 'run-1', plan_ref: approved.plans[0]!.plan_ref, status: 'running' },
              ],
            })
          : json(approved)),
    )
    const { flow, journal } = setup(fetcher, disk(), config)
    journal.update({ task_id: 'task-1', revision: 1, run_id: 'run-1' })
    await expect(flow.startCam(task)).rejects.toThrow(/already active/i)
    expect(fetcher.mock.calls.some((call) => call[0] === '/cam/runs')).toBe(false)
  })

  it('reads plans without config but blocks CAM writes', async () => {
    const fetcher = vi.fn(async (url: string) => taskRead(url) ?? json({ runs: [] }))
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'task-1', revision: 1 })
    await flow.refreshTask('task-1')
    expect(flow.snapshot().plan?.task_id).toBe('task-1')
    await expect(flow.startCam(task)).rejects.toThrow(/configuration unavailable/i)
    expect(fetcher.mock.calls.some((call) => call[0] === '/cam/runs')).toBe(false)
  })

  it('rejects a mismatched deployment template before CAM start', async () => {
    const fetcher = vi.fn(async (url: string) => taskRead(url) ?? json({ runs: [] }))
    const wrong = structuredClone(config)
    wrong.templates[0]!.template.digest = 'b'.repeat(64)
    const { flow, journal } = setup(fetcher, disk(), wrong)
    journal.update({ task_id: 'task-1', revision: 1 })
    await flow.refreshTask('task-1')
    expect(flow.snapshot().configurationError).toMatch(/mismatch/i)
    await expect(flow.startCam(task)).rejects.toThrow(/mismatch/i)
    expect(fetcher.mock.calls.some((call) => call[0] === '/cam/runs')).toBe(false)
  })

  it('matching configuration still requires the backend execution profile', async () => {
    const fetcher = vi.fn(async (url: string) => taskRead(url) ?? json({ runs: [] }))
    const wrongProfile = structuredClone(config)
    wrongProfile.templates[0]!.execution_profile_id = 'profile-other'
    const { flow, journal } = setup(fetcher, disk(), wrongProfile)
    journal.update({ task_id: 'task-1', revision: 1 })
    await expect(flow.startCam(task)).rejects.toThrow(/Execution profile differs/i)
    expect(fetcher.mock.calls.some((call) => call[0] === '/cam/runs')).toBe(false)
  })

  it('matching configuration and approved plan send the exact current CAM request', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/cam/runs' && init?.method === 'POST')
        return json({ context: { cam_run_id: 'run-1' }, command_id: 'command-1', kind: 'generate' })
      if (url === '/cam/runs/run-1')
        return json({
          cam_run_id: 'run-1',
          plan_ref: approved.plans[0]!.plan_ref,
          status: 'running',
          phase: 'prepare',
          current_candidate: null,
          allowed_actions: [],
        })
      return taskRead(url) ?? json({ runs: [] })
    })
    const { flow, journal } = setup(fetcher, disk(), config)
    journal.update({ task_id: 'task-1', revision: 1 })
    await flow.startCam(task)
    const call = fetcher.mock.calls.find(([url]) => url === '/cam/runs')!
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      command_id: 'command-1',
      plan_ref: approved.plans[0]!.plan_ref,
      execution_profile_id: 'profile-1',
      expected_current_revision: 1,
    })
    expect(journal.read().run_id).toBe('run-1')
  })

  it('reuses a matching parsed report with GET and clears old task selection', async () => {
    const fetcher = vi.fn(async () =>
      json({
        command_id: 'parse-1',
        asset_id: sha,
        source_sha256: sha,
        status: 'parsed',
        report_sha256: sha,
      }),
    )
    const { flow, journal } = setup(fetcher)
    journal.update({ task_id: 'old-task', run_id: 'old-run' })
    await flow.reuseParse(sha, 'parse-1')
    expect(journal.read()).toMatchObject({ asset_id: sha, parse_command_id: 'parse-1' })
    expect(journal.read().task_id).toBeUndefined()
    expect((fetcher.mock.calls as unknown as [string][])[0]![0]).toContain(
      '/parse?command_id=parse-1',
    )
  })
})

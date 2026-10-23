import { createHash } from 'node:crypto'
import type { Page } from '@playwright/test'

// 全部为浏览器契约测试合成数据，不含工程文件或制造结论。
export const sha = createHash('sha256').update('SYNTHETIC TEST FIXTURE ONLY').digest('hex')
const metadata = {
  rough_step: {
    name: '粗车层深',
    unit: 'mm',
    edit_policy: 'replace',
    allowed_values: [0.5, 0.4],
    source: {
      kind: 'synthetic_profile',
      resource_id: 'synthetic-profile',
      sha256: sha,
      pointer: '/rough_step',
      engineering_status: 'unconfirmed',
    },
  },
}
const operation = {
  id: 'synthetic-op',
  sequence: 1,
  name: '合成车削',
  steps: [{ id: 'synthetic-step', sequence: 1, content: '合成步骤' }],
  parameter_metadata: metadata,
}
const rule = {
  path: '/operations/0/attributes/parameters/rough_step',
  operation_id: operation.id,
  parameter_id: 'rough_step',
  value_type: 'number',
  unit: 'mm',
  allowed_values: [0.5, 0.4],
  edit_policy: 'replace',
}
export const integration = {
  schema_version: 'frontend-integration.v1',
  templates: [
    {
      template: { id: 'synthetic-template', version: '1.0.0', digest: sha },
      execution_profile_id: 'synthetic-profile',
      matching_evidence: { step_sha256: sha, report_sha256: sha, mcam_sha256: sha },
      operations: [operation],
      parameter_rules: [rule],
    },
  ],
}
export const configBody = JSON.stringify(integration)
export const configSha = createHash('sha256').update(configBody).digest('hex')

export async function syntheticCore(
  page: Page,
  options: {
    uploadError?: boolean
    parseError?: boolean
    lostReplan?: boolean
    ncError?: boolean
    stale?: boolean
    config?: 'invalid' | 'missing'
  } = {},
) {
  const writes: { path: string; body: Record<string, unknown> }[] = []
  let revision = 0
  let approved = false
  let parseCommand = ''
  let cam = false
  let lost = false
  const planRef = () => ({
    task_id: 'synthetic-task',
    result_id: `synthetic-result-${revision}`,
    revision,
    archive_digest: sha,
  })
  const ncRef = { cam_run_id: 'synthetic-cam', version: 1, content_digest: sha }
  const file = {
    file_id: 'synthetic-file',
    filename: 'synthetic.nc',
    setup_id: 'synthetic-setup',
    sequence: 1,
    encoding: 'utf-8',
    sha256: sha,
    size_bytes: 24,
  }
  await page.route('**/synthetic-integration.json', (route) =>
    route.fulfill(
      options.config === 'missing'
        ? { status: 404 }
        : {
            contentType: 'application/json',
            body: options.config === 'invalid' ? '{}' : configBody,
          },
    ),
  )
  await page.route(/\/(cad|planning|process-cards|cam)\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const post = request.method() === 'POST'
    const body =
      post && request.headers()['content-type'] === 'application/json'
        ? (request.postDataJSON() as Record<string, unknown>)
        : {}
    if (post) writes.push({ path, body })
    const json = (value: unknown) => route.fulfill({ json: value })
    if (path === '/cad/assets') {
      if (options.uploadError)
        return route.fulfill({
          status: 503,
          json: { error: { code: 5031, message: 'synthetic upload failure' } },
        })
      return json({ asset_id: sha, sha256: sha, filename: 'synthetic.step', status: 'not_parsed' })
    }
    if (path.endsWith('/parse')) {
      if (post) parseCommand = String(body.command_id)
      return json({
        command_id: parseCommand,
        asset_id: sha,
        source_sha256: sha,
        status: options.parseError ? 'failed' : 'parsed',
        report_sha256: sha,
        execution_ready: false,
      })
    }
    if (path === '/planning/tasks' && post)
      return json({
        task_id: 'synthetic-task',
        result_id: 'synthetic-result-0',
        current_revision: 0,
        feedback_version: 0,
      })
    if (path.endsWith('/replan')) {
      if (options.lostReplan && !lost) {
        lost = true
        return route.abort()
      }
      revision++
      approved = false
      return json({ run_id: `synthetic-plan-${revision}` })
    }
    if (path.includes('/planning/tasks/') && path.includes('/runs/'))
      return json({ run_id: `synthetic-plan-${revision}`, status: 'completed' })
    if (path === '/planning/tasks/synthetic-task')
      return json({
        task_id: 'synthetic-task',
        result_id: `synthetic-result-${revision}`,
        current_revision: revision,
        feedback_version: 0,
      })
    if (path.startsWith('/planning/') && path.includes('/results/'))
      return json({
        schema_version: 'template-plan-v1-integration',
        provider: 'template',
        event_id: 'synthetic-event',
        task_id: 'synthetic-task',
        result_id: `synthetic-result-${revision}`,
        revision,
        run_id: `synthetic-plan-${revision}`,
        trace_id: 'synthetic-trace',
        source_request_id: 'synthetic-source',
        trigger_request_id: 'synthetic-trigger',
        feedback_snapshot: { feedback_version: 0, items: [] },
        payload: {
          part: { name: '合成零件' },
          blank: {},
          resources: {},
          operations: [
            {
              ...operation,
              steps: operation.steps.map((step) => ({ ...step, attributes: {} })),
              attributes: {
                parameters: { rough_step: revision > 1 ? 0.4 : 0.5 },
                parameter_metadata: metadata,
              },
            },
          ],
          extensions: {
            ...integration.templates[0],
            parameter_rules: [rule],
            plan_digest: sha,
            reference_only: false,
            execution_ready: true,
            source_binding: 'integration_pending',
            preparation: {},
            applied_feedback_ids: [],
            engineering_status: 'pending',
          },
        },
      })
    if (path.endsWith('/review')) {
      approved = true
      return json({ status: 'approved' })
    }
    if (path.startsWith('/process-cards/'))
      return json({ status: 'ready', expected_feedback_version: 0 })
    if (path.endsWith('/approved-plans'))
      return json({
        execution_configured: true,
        execution_profile_id: 'synthetic-profile',
        plans: approved
          ? [
              {
                profile_matches: true,
                plan_ref: { ...planRef(), revision: options.stale ? revision - 1 : revision },
              },
            ]
          : [],
      })
    if (path === '/cam/runs' && post) {
      cam = true
      return json({
        context: { cam_run_id: 'synthetic-cam' },
        command_id: body.command_id,
        kind: 'generate',
      })
    }
    if (path === '/cam/tasks/synthetic-task/runs')
      return json({
        runs: cam
          ? [{ cam_run_id: 'synthetic-cam', status: 'completed', plan_ref: planRef() }]
          : [],
      })
    if (path.endsWith('/file'))
      return options.ncError
        ? route.fulfill({
            status: 503,
            json: { error: { code: 5031, message: 'synthetic NC read failure' } },
          })
        : json({ ...file, newline: 'LF', text: '(SYNTHETIC ONLY)\nM30\n' })
    if (path.includes('/nc/versions/'))
      return json({
        ref: ncRef,
        plan_ref: planRef(),
        origin: 'cam_generated',
        parent: null,
        review_status: 'pending',
        files: [file],
        reviews: [],
        feedback_id: null,
        simulation_version: null,
        comparison_sha256: null,
        root_run_id: 'synthetic-cam',
        is_current_candidate: true,
        allowed_actions: ['review'],
      })
    if (path === '/cam/runs/synthetic-cam')
      return json({
        cam_run_id: 'synthetic-cam',
        plan_ref: planRef(),
        status: 'completed',
        phase: 'collect',
        current_candidate: ncRef,
        allowed_actions: [],
      })
    return route.fulfill({
      status: 500,
      json: { error: { message: `Unmocked synthetic endpoint: ${path}` } },
    })
  })
  return writes
}

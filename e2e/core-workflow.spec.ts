import { expect, test } from '@playwright/test'

test('Core workspace separates demo data and blocks missing execution', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: '返回真实流程' }).click()
  await expect(page.getByRole('region', { name: '模型输入', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeDisabled()
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await expect(page.getByRole('button', { name: '进入工艺决策', exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('core-workspace.png'), fullPage: true })
})

test('failed STEP intake cannot enable parsing or planning', async ({ page }) => {
  await page.route('**/cad/assets?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":{"message":"CAD not configured"}}',
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: '返回真实流程' }).click()
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'ring.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('STEP'),
  })
  await page.getByRole('button', { name: '上传模型' }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('button', { name: '开始解析' })).toHaveCount(0)
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await expect(page.getByRole('button', { name: '进入工艺决策', exact: true })).toHaveCount(0)
})

test('an approved older revision never enables current CAM execution', async ({ page }) => {
  await page.route('**/planning/tasks/task-1', (route) =>
    route.fulfill({ json: { task_id: 'task-1', current_revision: 2, feedback_version: 1 } }),
  )
  await page.route('**/planning/tasks/task-1/results/2', (route) =>
    route.fulfill({
      json: {
        payload: { operations: [], extensions: { reference_only: true, execution_ready: false } },
      },
    }),
  )
  await page.route('**/process-cards/tasks/id_dGFzay0x/results/2', (route) =>
    route.fulfill({ json: { status: 'ready', expected_feedback_version: 1, card: {} } }),
  )
  await page.route('**/cam/tasks/task-1/runs', (route) => route.fulfill({ json: { runs: [] } }))
  await page.route('**/cam/tasks/task-1/approved-plans', (route) =>
    route.fulfill({
      json: {
        execution_configured: true,
        execution_profile_id: 'profile',
        plans: [
          {
            profile_matches: true,
            plan_ref: {
              task_id: 'task-1',
              result_id: 'result',
              revision: 1,
              archive_digest: 'old',
            },
          },
        ],
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: '返回真实流程' }).click()
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByText('恢复已有任务', { exact: true }).click()
  await page.getByLabel('任务 ID', { exact: true }).fill('task-1')
  await refreshTask(page)
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByText(/Core · 工艺修订 2/)).toBeVisible()
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeDisabled()
})

async function readyTask(page: import('@playwright/test').Page) {
  await page.route('**/planning/tasks/task-a', (route) =>
    route.fulfill({ json: { task_id: 'task-a', current_revision: 1, feedback_version: 0 } }),
  )
  await page.route('**/planning/tasks/task-a/results/*', (route) =>
    route.fulfill({ json: { payload: { operations: [], extensions: {} } } }),
  )
  await page.route('**/process-cards/tasks/id_dGFzay1h/results/*', (route) =>
    route.fulfill({ json: { status: 'ready', expected_feedback_version: 0, card: {} } }),
  )
  await page.route('**/cam/tasks/task-a/runs', (route) => route.fulfill({ json: { runs: [] } }))
  await page.route('**/cam/tasks/task-a/approved-plans', (route) =>
    route.fulfill({
      json: {
        execution_configured: true,
        execution_profile_id: 'profile',
        plans: [
          {
            profile_matches: true,
            plan_ref: {
              task_id: 'task-a',
              result_id: 'result',
              revision: 1,
              archive_digest: 'digest',
            },
          },
        ],
      },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: '返回真实流程' }).click()
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByText('恢复已有任务', { exact: true }).click()
  await page.getByLabel('任务 ID', { exact: true }).fill('task-a')
  await refreshTask(page)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeEnabled()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await page.getByLabel('审核人 ID').fill('reviewer')
}

test('a failed task switch cannot retain the previous approval or plan', async ({ page }) => {
  await readyTask(page)
  await page.route('**/planning/tasks/task-b', (route) =>
    route.fulfill({ json: { task_id: 'task-b', current_revision: 1, feedback_version: 0 } }),
  )
  await page.route('**/cam/tasks/task-b/runs', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  )
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByText('恢复已有任务', { exact: true }).click()
  await page.getByLabel('任务 ID', { exact: true }).fill('task-b')
  await refreshTask(page)
  await expect(page.getByRole('alert')).toContainText('503')
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeDisabled()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByRole('button', { name: '批准当前工艺' })).toBeDisabled()
})

test('lost replan response freezes approval and recovers the same command before reading the new revision', async ({
  page,
}) => {
  await readyTask(page)
  const commands: string[] = []
  let completed = false
  await page.route('**/planning/tasks/task-a/replan', async (route) => {
    commands.push(route.request().postDataJSON().command_id)
    if (commands.length === 1) await route.abort()
    else await route.fulfill({ json: { run_id: 'planning-2' } })
  })
  await page.route('**/planning/tasks/task-a/runs/planning-2', (route) => {
    completed = true
    return route.fulfill({ json: { status: 'completed' } })
  })
  await page.route('**/planning/tasks/task-a', (route) =>
    route.fulfill({
      json: { task_id: 'task-a', current_revision: completed ? 2 : 1, feedback_version: 0 },
    }),
  )
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await page.getByRole('button', { name: '生成模板工艺' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByRole('button', { name: '批准当前工艺' })).toBeDisabled()
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeDisabled()
  await refreshTask(page)
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByText(/Core · 工艺修订 2/)).toBeVisible()
  expect(commands).toHaveLength(2)
  expect(commands[1]).toBe(commands[0])
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeDisabled()
})

test('NC metadata without readable file content cannot be approved', async ({ page }) => {
  await readyTask(page)
  await page.route('**/cam/tasks/task-a/runs', (route) =>
    route.fulfill({ json: { runs: [{ cam_run_id: 'cam-1', status: 'succeeded' }] } }),
  )
  const ref = { cam_run_id: 'cam-1', version: 1, content_digest: 'digest' }
  await page.route('**/cam/runs/cam-1', (route) =>
    route.fulfill({
      json: {
        cam_run_id: 'cam-1',
        status: 'succeeded',
        phase: 'collect',
        current_candidate: ref,
        allowed_actions: [],
      },
    }),
  )
  await page.route('**/cam/runs/cam-1/nc/versions/1', (route) =>
    route.fulfill({
      json: {
        ref,
        review_status: 'pending',
        allowed_actions: ['review'],
        files: [{ file_id: 'setup/a.nc', filename: 'a.nc' }],
      },
    }),
  )
  await page.route('**/cam/runs/cam-1/nc/versions/1/file?*', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  )
  await refreshTask(page)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await page.getByLabel('已有运行').selectOption('cam-1')
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('button', { name: '批准当前 NC' })).toHaveCount(0)
})

test('a definitive planning rejection allows correction after authoritative refresh', async ({
  page,
}) => {
  await readyTask(page)
  await page.route('**/planning/tasks/task-a/replan', (route) =>
    route.fulfill({ status: 422, body: 'invalid parameters' }),
  )
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await page.getByRole('button', { name: '生成模板工艺' }).click()
  await expect(page.getByRole('alert')).toContainText('422')
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeDisabled()
  await refreshTask(page)
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByRole('button', { name: '生成模板工艺' })).toBeEnabled()
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeEnabled()
})

test('active CAM observes progress and blocks duplicate dispatch', async ({ page }) => {
  await readyTask(page)
  await page.route('**/cam/runs', (route) =>
    route.fulfill({ json: { context: { cam_run_id: 'cam-active' } } }),
  )
  await page.route('**/cam/runs/cam-active', (route) =>
    route.fulfill({
      json: {
        cam_run_id: 'cam-active',
        status: 'running',
        phase: 'prepare',
        current_candidate: null,
        allowed_actions: [],
      },
    }),
  )
  let observed = 0
  await page.route('**/cam/runs/cam-active/observe', (route) => {
    observed++
    return route.fulfill({
      json: {
        cam_run_id: 'cam-active',
        status: 'running',
        phase: 'simulate',
        current_candidate: null,
        allowed_actions: [],
      },
    })
  })
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await page.getByRole('button', { name: '生成 NC 程序', exact: true }).click()
  await expect(page.getByText(/CAM running \/ simulate/)).toBeVisible()
  expect(observed).toBe(1)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序', exact: true })).toBeDisabled()
})

test('real operations and task state survive navigation and foundation view', async ({ page }) => {
  await readyTask(page)
  await page.route('**/planning/tasks/task-a/results/*', (route) =>
    route.fulfill({
      json: {
        payload: {
          operations: [
            {
              id: 'op-real',
              name: '真实外圆粗车',
              steps: [{ id: 'step-real', sequence: 1, content: '服务端粗车工步' }],
              attributes: {
                parameters: { rough_step: 0.4 },
                tool: { station: 3, tool_number: 3 },
                setup_id: 'setup-real',
              },
            },
          ],
          extensions: {},
        },
      },
    }),
  )
  await refreshTask(page)
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByRole('button', { name: '01 真实外圆粗车' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '01 服务端粗车工步' })).toBeVisible()
  await page.getByRole('button', { name: '数据底座', exact: true }).click()
  await page.getByRole('button', { name: '返回智能工艺工作台' }).click()
  await expect(page.getByRole('heading', { name: '01 服务端粗车工步' })).toBeVisible()
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeEnabled()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByLabel('审核人 ID')).toHaveValue('reviewer')
})

async function refreshTask(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '01 模型输入' }).click()
  const read = page.getByRole('button', { name: '读取任务', exact: true })
  if (!(await read.isVisible())) await page.getByText('恢复已有任务', { exact: true }).click()
  await read.click()
  await expect(read).toBeEnabled()
}

test('prototype file picker completes the real API contract without a separate workspace', async ({
  page,
}, info) => {
  let revision = 0,
    rough = 0.5,
    approved = false,
    reviewed = false
  const changes: unknown[] = []
  const task = () => ({ task_id: 'flow', current_revision: revision, feedback_version: 0 })
  const ref = { cam_run_id: 'run-flow', version: 1, content_digest: 'nc-digest' }
  await page.route('**/cad/assets?*', (route) =>
    route.fulfill({
      json: { asset_id: 'asset', sha256: 'source', filename: 'ring.stp', status: 'stored' },
    }),
  )
  await page.route('**/cad/assets/asset/parse', (route) =>
    route.fulfill({
      json: {
        asset_id: 'asset',
        source_sha256: 'source',
        command_id: 'parse',
        status: 'parsed',
        execution_ready: false,
      },
    }),
  )
  await page.route('**/planning/tasks', (route) => route.fulfill({ json: task() }))
  await page.route('**/planning/tasks/flow', (route) => route.fulfill({ json: task() }))
  await page.route('**/planning/tasks/flow/replan', (route) => {
    const body = route.request().postDataJSON()
    if (body.parameter_patch) {
      changes.push(body.parameter_patch)
      rough = body.parameter_patch.changes[0].value
    }
    revision++
    approved = false
    return route.fulfill({ json: { run_id: `planning-${revision}` } })
  })
  await page.route('**/planning/tasks/flow/runs/*', (route) =>
    route.fulfill({ json: { status: 'completed' } }),
  )
  await page.route('**/planning/tasks/flow/results/*', (route) =>
    route.fulfill({
      json: {
        payload: {
          operations: [
            {
              id: 'outer',
              name: '外圆粗车',
              steps: [{ id: 'step', sequence: 1, content: '粗车外圆' }],
              attributes: {
                parameters: { rough_step: rough },
                tool: { tool_number: 1, station: 1 },
              },
            },
          ],
          extensions: {
            template: { digest: 'template' },
            plan_digest: 'plan',
            reference_only: false,
            execution_ready: true,
          },
        },
      },
    }),
  )
  await page.route('**/process-cards/tasks/id_Zmxvdw/results/*', (route) =>
    route.fulfill({ json: { status: 'ready', expected_feedback_version: 0, card: {} } }),
  )
  await page.route('**/process-cards/tasks/id_Zmxvdw/results/*/review', (route) => {
    approved = true
    return route.fulfill({ json: { status: 'approved' } })
  })
  await page.route('**/cam/tasks/flow/runs', (route) => route.fulfill({ json: { runs: [] } }))
  await page.route('**/cam/tasks/flow/approved-plans', (route) =>
    route.fulfill({
      json: {
        execution_configured: true,
        execution_profile_id: 'profile',
        plans: approved
          ? [
              {
                profile_matches: true,
                plan_ref: {
                  task_id: 'flow',
                  result_id: 'result',
                  revision,
                  archive_digest: 'archive',
                },
              },
            ]
          : [],
      },
    }),
  )
  await page.route('**/cam/runs', (route) => {
    expect(route.request().postDataJSON().expected_current_revision).toBe(2)
    return route.fulfill({ json: { context: { cam_run_id: 'run-flow' } } })
  })
  await page.route('**/cam/runs/run-flow', (route) =>
    route.fulfill({
      json: {
        cam_run_id: 'run-flow',
        status: 'succeeded',
        phase: 'collect',
        current_candidate: ref,
        allowed_actions: [],
      },
    }),
  )
  await page.route('**/cam/runs/run-flow/nc/versions/1', (route) =>
    route.fulfill({
      json: {
        ref,
        review_status: reviewed ? 'approved' : 'pending',
        allowed_actions: reviewed ? ['download'] : ['review'],
        files: [{ file_id: 'output/test.nc', filename: 'test.nc' }],
      },
    }),
  )
  await page.route('**/cam/runs/run-flow/nc/versions/1/file?*', (route) =>
    route.fulfill({ json: { text: '(SYNTHETIC UI TEST ONLY - NOT MACHINING CODE)' } }),
  )
  await page.route('**/cam/runs/run-flow/nc/versions/1/review', (route) => {
    expect(route.request().postDataJSON().nc_ref).toEqual(ref)
    reviewed = true
    return route.fulfill({ json: { status: 'approved' } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '返回真实流程' }).click()
  await expect(page.getByRole('button', { name: '打开 Core 真实工作区' })).toHaveCount(0)
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'ring.stp',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('TEST STEP'),
  })
  await page.getByRole('button', { name: '上传模型', exact: true }).click()
  await page.getByRole('button', { name: '开始解析' }).click()
  await page.getByRole('button', { name: '进入工艺决策', exact: true }).click()
  await page.getByRole('button', { name: '生成模板工艺' }).click()
  await page.getByRole('button', { name: '刷新工艺' }).click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await page.getByLabel('粗车步距', { exact: true }).fill('0.4')
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '生成 NC 程序' })).toBeDisabled()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByLabel('粗车步距', { exact: true })).toHaveValue('0.4')
  await expect(page.getByRole('button', { name: '批准当前工艺', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '提交参数修订' }).click()
  await page.getByRole('button', { name: '刷新工艺' }).click()
  expect(changes).toHaveLength(1)
  await expect(page.getByLabel('粗车步距', { exact: true })).toHaveValue('0.4')
  await page.getByLabel('审核人 ID').fill('test-reviewer')
  await page.getByRole('button', { name: '批准当前工艺', exact: true }).click()
  await page.screenshot({ path: info.outputPath('prototype-real-planning.png'), fullPage: true })
  await page.getByRole('button', { name: '进入程序审核', exact: true }).click()
  await page.getByRole('button', { name: '生成 NC 程序' }).click()
  await expect(page.getByLabel('NC 程序正文')).toContainText('SYNTHETIC UI TEST ONLY')
  await expect(page.getByLabel('NC 程序正文')).not.toHaveAttribute('contenteditable', 'true')
  await expect(page.getByRole('button', { name: '下载批准版本' })).toBeDisabled()
  await page.getByRole('button', { name: '批准当前 NC' }).click()
  await expect(page.getByRole('button', { name: '下载批准版本' })).toBeEnabled()
  await page.screenshot({ path: info.outputPath('prototype-real-review.png'), fullPage: true })
})

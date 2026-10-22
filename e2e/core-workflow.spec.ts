import { expect, test } from '@playwright/test'

test('Core workspace separates demo data and blocks missing execution', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: '打开 Core 真实工作区' }).click()
  await expect(page.getByRole('region', { name: 'Core 真实工作区' })).toBeVisible()
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '创建模板规划任务' })).toBeDisabled()
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
  await page.getByRole('button', { name: '打开 Core 真实工作区' }).click()
  await page.getByLabel('上传真实 STEP').setInputFiles({
    name: 'ring.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('STEP'),
  })
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('button', { name: '执行 NX 解析' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '创建模板规划任务' })).toBeDisabled()
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
  await page.route('**/process-cards/tasks/task-1/results/2', (route) =>
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
  await page.getByRole('button', { name: '打开 Core 真实工作区' }).click()
  await page.getByLabel('恢复任务 ID').fill('task-1')
  await page.getByRole('button', { name: '读取 / 刷新任务' }).click()
  await expect(page.getByText('任务 task-1 · 修订 2 · 反馈 1')).toBeVisible()
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
})

async function readyTask(page: import('@playwright/test').Page) {
  await page.route('**/planning/tasks/task-a', (route) =>
    route.fulfill({ json: { task_id: 'task-a', current_revision: 1, feedback_version: 0 } }),
  )
  await page.route('**/planning/tasks/task-a/results/*', (route) =>
    route.fulfill({ json: { payload: { operations: [], extensions: {} } } }),
  )
  await page.route('**/process-cards/tasks/task-a/results/*', (route) =>
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
  await page.getByRole('button', { name: '打开 Core 真实工作区' }).click()
  await page.getByLabel('恢复任务 ID').fill('task-a')
  await page.getByRole('button', { name: '读取 / 刷新任务' }).click()
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeEnabled()
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
  await page.getByLabel('恢复任务 ID').fill('task-b')
  await page.getByRole('button', { name: '读取 / 刷新任务' }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
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
  await page.getByRole('button', { name: '生成模板工艺' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
  await page.getByRole('button', { name: '读取 / 刷新任务' }).click()
  await expect(page.getByText('任务 task-a · 修订 2 · 反馈 0')).toBeVisible()
  expect(commands).toHaveLength(2)
  expect(commands[1]).toBe(commands[0])
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
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
  await page.getByRole('button', { name: '读取 / 刷新任务' }).click()
  await page.getByRole('button', { name: '读取运行 cam-1 · succeeded' }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('button', { name: '批准当前 NC' })).toHaveCount(0)
})

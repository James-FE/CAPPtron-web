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

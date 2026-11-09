import { test, expect } from '@playwright/test'
import { coreFixture, startPlanning, openPlan, approvePlan } from './coreFixture'
import fixture from './fixtures/core-golden.json' with { type: 'json' }

test('CAM 准入冲突保留审批并引导检查状态，不自动重发', async ({ page }, info) => {
  await coreFixture(page)
  let submissions = 0
  await page.route('**/cam/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    submissions++
    return route.fulfill({
      status: 409,
      json: {
        error: { code: 8302, message: 'CAM workflow conflict' },
        request_id: 'cam-conflict-request',
      },
    })
  })
  await startPlanning(page)
  await openPlan(page)
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(
    page.getByRole('heading', { name: 'CAM 状态冲突，请检查执行器状态及当前工艺版本' }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'CAM 真实进度' })
      .getByText(/Core HTTP 409 · 8302.*cam-conflict-request/),
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('cam-conflict.png'), fullPage: true })
  await page.getByRole('button', { name: '返回工艺决策' }).click()
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toHaveAttribute(
    'title',
    '当前工艺已批准，无需重复批准。',
  )
  await expect(page.getByRole('button', { name: '运行 Mastercam' })).toBeDisabled()
  expect(submissions).toBe(1)
})

test('运行契约失败保留原始错误并提示维护人员，不显示成功', async ({ page }, info) => {
  const core = await coreFixture(page, { camWait: true })
  await page.route('**/cam/runs/*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      json: {
        ...fixture.cam,
        plan_ref: { ...fixture.approved.plans[0]!.plan_ref, revision: 1 },
        current_candidate: null,
        status: 'failed',
        phase: 'prepare',
        allowed_actions: [],
        error: { code: 8101, message: 'Invalid CAM contract' },
      },
    })
  })
  await startPlanning(page)
  await openPlan(page)
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByText('CAM · failed / prepare')).toBeVisible()
  await expect(page.getByText('CAM 异常 · 8101 · Invalid CAM contract')).toBeVisible()
  await expect(page.getByText(/CAM 资源或契约校验失败，请维护人员检查部署/)).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0')
  expect(core.commands.filter((command) => command.path === '/cam/runs')).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('cam-contract.png'), fullPage: true })
})

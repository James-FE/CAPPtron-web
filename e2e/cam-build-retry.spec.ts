import { test, expect } from '@playwright/test'
import { coreFixture, startPlanning, openPlan, approvePlan } from './coreFixture'
import fixture from './fixtures/core-golden.json' with { type: 'json' }

test('构建失败后只在用户点击时新建运行，沿用批准输入并保留旧结果', async ({ page }, info) => {
  const core = await coreFixture(page)
  const requests: Record<string, unknown>[] = []
  await page.route('**/cam/runs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    requests.push(route.request().postDataJSON())
    return route.fulfill({
      status: 202,
      json: { context: { cam_run_id: `retry-${requests.length}` } },
    })
  })
  await page.route('**/cam/runs/retry-*', async (route) =>
    route.fulfill({
      json: {
        ...fixture.cam,
        cam_run_id: new URL(route.request().url()).pathname.split('/').pop(),
        plan_ref: requests[0]!.plan_ref,
        status: 'failed',
        phase: 'build',
        current_candidate: null,
        error: { code: 8121, message: 'CAM task build failed' },
        allowed_actions: [],
      },
    }),
  )
  await startPlanning(page)
  await openPlan(page)
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByText('本次运行已失败')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新运行 CAM' })).toBeEnabled()
  expect(requests).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('build-retry.png'), fullPage: true })
  await page.getByRole('button', { name: '重新运行 CAM' }).click()
  await expect(page.getByText('retry-2', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(2)
  expect(requests[1]!.command_id).not.toBe(requests[0]!.command_id)
  expect(requests[1]!.plan_ref).toEqual(requests[0]!.plan_ref)
  expect(core.commands.filter((x) => x.path.endsWith('/review'))).toHaveLength(1)
})

for (const [code, status, message] of [
  [8308, 503, 'Worker 不可达，CAM 尚未启动；请检查执行器连接'],
  [8125, 409, '执行器需要恢复，CAM 尚未启动；请核对恢复状态'],
] as const) {
  test(`执行器拒绝${code}保留工艺审批且不自动重发`, async ({ page }, info) => {
    await coreFixture(page)
    let submissions = 0
    await page.route('**/cam/runs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      submissions++
      return route.fulfill({
        status,
        json: { error: { code, message: 'executor admission' }, request_id: 'executor-request' },
      })
    })
    await startPlanning(page)
    await openPlan(page)
    await approvePlan(page)
    await page.getByRole('button', { name: '运行 Mastercam' }).click()
    await expect(page.getByRole('heading', { name: message })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`executor-${code}.png`), fullPage: true })
    await page.getByRole('button', { name: '返回工艺决策' }).click()
    await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toHaveAttribute(
      'title',
      '当前工艺已批准，无需重复批准。',
    )
    expect(submissions).toBe(1)
  })
}

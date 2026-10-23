import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { syntheticCore } from './fixtures/corePrototype'

async function screenshot(page: Page, info: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
}
async function intake(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '模型输入', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '切换演示流程' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Core 真实工作区' })).toHaveCount(0)
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'synthetic.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('SYNTHETIC TEST FIXTURE ONLY'),
  })
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
}
async function planning(page: Page) {
  await intake(page)
  await page.getByRole('button', { name: '执行 NX 解析', exact: true }).click()
  await page.getByRole('button', { name: '创建工艺规划任务', exact: true }).click()
  await page.getByRole('button', { name: '生成模板工艺', exact: true }).click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await expect(page.getByLabel('粗车层深', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '提交参数修订', exact: true })).toBeDisabled()
}

test('original three stages use synthetic HTTP contracts through revision, approval and NC, then reload reads only', async ({
  page,
}, info) => {
  const writes = await syntheticCore(page)
  await intake(page)
  await screenshot(page, info, 'prototype-input')
  await page.getByRole('button', { name: '执行 NX 解析', exact: true }).click()
  await page.getByRole('button', { name: '创建工艺规划任务', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工艺决策', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '生成模板工艺', exact: true }).click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await expect(page.getByLabel('粗车层深', { exact: true })).toBeVisible()
  await page.getByLabel('审核人', { exact: true }).fill('synthetic-reviewer')
  await page.getByLabel('粗车层深', { exact: true }).selectOption('0.4')
  await expect(page.getByRole('button', { name: '批准当前工艺卡', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '提交参数修订', exact: true }).click()
  await expect(page.getByText('合成零件 · 修订 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '批准当前工艺卡', exact: true })).toBeEnabled()
  await expect(page.getByRole('complementary', { name: '任务信息与工序' })).toBeVisible()
  await expect(page.locator('.decision-columns')).toBeVisible()
  await screenshot(page, info, 'prototype-planning')
  const revisions = writes.filter((write) => write.path.endsWith('/replan'))
  expect(revisions).toHaveLength(2)
  expect(revisions[1]!.body).toMatchObject({
    base_revision: 1,
    expected_feedback_version: 0,
    parameter_patch: {
      changes: [
        { operation_id: 'synthetic-op', parameter_id: 'rough_step', value: 0.4, unit: 'mm' },
      ],
    },
  })
  await page.getByRole('button', { name: '批准当前工艺卡', exact: true }).click()
  await page.getByRole('button', { name: '运行 Mastercam 并进入审核', exact: true }).click()
  await expect(page.getByRole('heading', { name: '程序审核', exact: true })).toBeVisible()
  await expect(page.getByLabel('NC 正文 synthetic.nc')).toContainText('(SYNTHETIC ONLY)')
  await expect(page.locator('.program-editor-layout')).toBeVisible()
  await expect(page.locator('.program-panel')).toBeVisible()
  await expect(page.locator('.program-toolbar')).toBeVisible()
  await expect(page.locator('.program-content')).toBeVisible()
  await expect(page.locator('.program-actions')).toBeVisible()
  await expect(page.getByLabel('NC 正文 synthetic.nc')).toHaveAttribute('contenteditable', 'false')
  await screenshot(page, info, 'prototype-nc')
  expect(writes.filter((write) => write.path === '/cam/runs')).toHaveLength(1)
  expect(writes.find((write) => write.path === '/cam/runs')!.body).toMatchObject({
    expected_current_revision: 2,
    plan_ref: { task_id: 'synthetic-task', result_id: 'synthetic-result-2', revision: 2 },
  })
  const beforeReload = writes.length
  await page.reload()
  await page
    .getByRole('navigation', { name: '编程流程' })
    .getByRole('button', { name: '03 程序审核' })
    .click()
  await expect(page.getByLabel('NC 正文 synthetic.nc')).toContainText('M30')
  expect(writes).toHaveLength(beforeReload)
})

test('upload failure blocks parse and task creation', async ({ page }) => {
  const writes = await syntheticCore(page, { uploadError: true })
  await intake(page)
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('button', { name: '执行 NX 解析', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '创建工艺规划任务', exact: true })).toBeDisabled()
  expect(writes).toHaveLength(1)
})

test('failed parse blocks task creation', async ({ page }) => {
  const writes = await syntheticCore(page, { parseError: true })
  await intake(page)
  await page.getByRole('button', { name: '执行 NX 解析', exact: true }).click()
  await expect(page.getByText(/解析状态：failed/)).toBeVisible()
  await expect(page.getByRole('button', { name: '创建工艺规划任务', exact: true })).toBeDisabled()
  expect(writes.some((write) => write.path === '/planning/tasks')).toBe(false)
})

test('stale backend approval cannot start CAM', async ({ page }) => {
  const writes = await syntheticCore(page, { stale: true })
  await planning(page)
  await page.getByLabel('审核人', { exact: true }).fill('synthetic-reviewer')
  await page.getByRole('button', { name: '批准当前工艺卡', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '运行 Mastercam 并进入审核', exact: true }),
  ).toBeDisabled()
  expect(writes.some((write) => write.path === '/cam/runs')).toBe(false)
})

for (const config of ['invalid', 'missing'] as const) {
  test(`${config} deployment configuration blocks all workflow mutations`, async ({ page }) => {
    const writes = await syntheticCore(page, { config })
    await page.goto('/')
    await expect(page.getByRole('alert')).toContainText(
      config === 'missing' ? '404' : 'digest mismatch',
    )
    await page.getByLabel('选择 STEP 模型文件').setInputFiles({
      name: 'synthetic.step',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('SYNTHETIC ONLY'),
    })
    await expect(page.getByRole('button', { name: '上传 STEP', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '执行 NX 解析', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '创建工艺规划任务', exact: true })).toBeDisabled()
    expect(writes).toHaveLength(0)
  })
}

test('unknown planning write reloads without reposting and explicit retry retains command', async ({
  page,
}) => {
  const writes = await syntheticCore(page, { lostReplan: true })
  await intake(page)
  await page.getByRole('button', { name: '执行 NX 解析', exact: true }).click()
  await page.getByRole('button', { name: '创建工艺规划任务', exact: true }).click()
  await page.getByRole('button', { name: '生成模板工艺', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '批准当前工艺卡', exact: true })).toBeDisabled()
  await expect(
    page.getByRole('button', { name: '运行 Mastercam 并进入审核', exact: true }),
  ).toBeDisabled()
  const beforeReload = writes.length
  await page.reload()
  await page
    .getByRole('navigation', { name: '编程流程' })
    .getByRole('button', { name: '02 工艺决策' })
    .click()
  await expect(page.getByRole('button', { name: '重试原命令', exact: true })).toBeVisible()
  expect(writes).toHaveLength(beforeReload)
  await page.getByRole('button', { name: '重试原命令', exact: true }).click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await expect(page.getByLabel('粗车层深', { exact: true })).toBeVisible()
  const replans = writes.filter((write) => write.path.endsWith('/replan'))
  expect(replans).toHaveLength(2)
  expect(replans[1]!.body).toEqual(replans[0]!.body)
})

test('incomplete NC file retrieval cannot display a valid current NC', async ({ page }) => {
  await syntheticCore(page, { ncError: true })
  await planning(page)
  await page.getByLabel('审核人', { exact: true }).fill('synthetic-reviewer')
  await page.getByRole('button', { name: '批准当前工艺卡', exact: true }).click()
  await page.getByRole('button', { name: '运行 Mastercam 并进入审核', exact: true }).click()
  await page
    .getByRole('navigation', { name: '编程流程' })
    .getByRole('button', { name: '03 程序审核' })
    .click()
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByLabel('NC 正文 synthetic.nc')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '暂无当前版本 NC' })).toBeVisible()
})

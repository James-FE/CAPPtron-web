import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Page, TestInfo } from '@playwright/test'

async function screenshot(page: Page, info: TestInfo, name: string) {
  const directory = `docs/api/simulation-evidence/${info.project.name}`
  mkdirSync(directory, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true })
}
async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '模拟完整流程' }).click()
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
}
test('本地 JSON 复用完整页面：审核人、参数修订、CAM、NC、下载与刷新恢复', async ({
  page,
}, info) => {
  const network: string[] = []
  page.on('request', (request) => {
    if (/\/(cad|planning|process-cards|cam)\//.test(new URL(request.url()).pathname))
      network.push(request.url())
  })
  await start(page)
  await expect(page.getByRole('navigation', { name: '工序列表' }).getByRole('button')).toHaveCount(
    7,
  )
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
  await page.getByLabel('审核人 ID', { exact: true }).fill('reviewer-01')
  await screenshot(page, info, 'planning-reviewer')
  const list = await page.locator('.operation-list').boundingBox()
  expect(list!.height).toBeGreaterThanOrEqual(info.project.name.includes('1440') ? 270 : 450)
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button')
    .filter({ hasText: '外圆粗车' })
    .click()
  await page.getByRole('button', { name: '参数与资源', exact: true }).click()
  await page.getByLabel('粗车参数 rough_step').selectOption('0.4')
  await page.getByRole('button', { name: '提交参数修订' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await page.getByRole('button', { name: '批准当前工艺卡' }).click()
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByLabel('NC 文件')).toBeVisible()
  await page.getByLabel('NC 文件').selectOption('file-2')
  await expect(page.locator('.cm-content')).toContainText('EVIDENCE 2')
  await screenshot(page, info, 'nc-reviewer')
  await page.getByRole('button', { name: '批准当前 NC', exact: true }).click()
  await page.getByRole('button', { name: '确认批准精确版本' }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载批准版本' }).click()
  expect((await downloaded).suggestedFilename()).toBe('SIMULATION-ONLY.zip')
  const before = await page.evaluate(() => localStorage.getItem('capptron.simulation.v1'))
  expect(before).toContain('reviewer-01')
  await page.reload()
  await page.getByRole('button', { name: /程序审核/ }).click()
  await expect(page.getByLabel('审核人 ID', { exact: true })).toHaveValue('reviewer-01')
  await expect(page.getByRole('button', { name: '下载批准版本' })).toBeEnabled()
  expect(await page.evaluate(() => localStorage.getItem('capptron.simulation.v1'))).toBe(before)
  expect(network).toEqual([])
})

test('模拟 CAM 失败不开放 NC 审核，真实模式不读取模拟任务和审核人', async ({ page }, info) => {
  await page.goto('/?mode=simulation')
  await page.getByLabel('模拟场景').selectOption('cam-failure')
  await page.getByRole('button', { name: '使用示例 Golden-simulation.step' }).click()
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await page.getByLabel('审核人 ID', { exact: true }).fill('reviewer-03')
  await page.getByRole('button', { name: '批准当前工艺卡' }).click()
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟 CAM 执行失败')
  await expect(page.getByRole('button', { name: '批准当前 NC', exact: true })).toHaveCount(0)
  await screenshot(page, info, 'cam-error')
  const saved = await page.evaluate(() => localStorage.getItem('capptron.simulation.v1'))
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await expect(page.getByText('真实 Core API', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await expect(page.getByText('尚未创建', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('capptron.simulation.v1'))).toBe(saved)
})

test('共用信息、现场信息提交回读、准入门禁和重新规划', async ({ page }, info) => {
  await page.goto('/?mode=simulation')
  await page.getByLabel('模拟场景').selectOption('needs-replan')
  await page.getByRole('button', { name: '使用示例 Golden-simulation.step' }).click()
  await screenshot(page, info, 'input')
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await page.getByLabel('审核人 ID', { exact: true }).fill('reviewer-02')
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeDisabled()
  await page.getByRole('button', { name: '任务共用信息 待填 5' }).click()
  for (const [name, value] of [
    ['现场毛坯外径', '43'],
    ['现场毛坯预孔直径', '38'],
    ['现场毛坯长度', '100'],
    ['工件零点 / 偏置核对', 'G54 待工程核对'],
    ['装夹方式与夹具核对', '三爪卡盘 待工程核对'],
  ])
    await page.getByRole('textbox', { name, exact: true }).fill(value)
  await screenshot(page, info, 'task-information')
  await page.getByRole('button', { name: '定位待填工序，1 项' }).click()
  await page.getByRole('textbox', { name: '内孔表面粗糙度要求 Ra', exact: true }).fill('1.6')
  await page.getByRole('button', { name: '提交补充信息', exact: true }).click()
  await page.getByLabel('查看任务状态详情').click()
  await expect(
    page.getByText('现场信息已提交并回读；未应用到 CAM，需重新核对工艺与审批。', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('查看任务状态详情').click()
  await page.getByRole('button', { name: '根据补充信息重新规划' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await expect(page.getByRole('button', { name: '批准当前工艺卡' })).toBeEnabled()
  await page.reload()
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await page.getByRole('button', { name: '任务共用信息 已补齐' }).click()
  await expect(page.getByRole('textbox', { name: '现场毛坯外径', exact: true })).toHaveValue('43')
  const actions = await page.locator('.live-planning-actions').boundingBox()
  expect(actions!.height).toBeLessThanOrEqual(56)
  await screenshot(page, info, 'restored-information')
})

test('模拟错误可见、解析可重试、任务 ID 可查询且未知 ID 不伪造', async ({ page }, info) => {
  await page.goto('/?mode=simulation')
  await page.getByLabel('模拟场景').selectOption('parse-failure')
  await page.getByRole('button', { name: '使用示例 Golden-simulation.step' }).click()
  await page.getByRole('button', { name: '上传 STEP', exact: true }).click()
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await expect(page.getByRole('alert')).toContainText('模拟 NX 解析失败')
  await screenshot(page, info, 'parse-error')
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByLabel('模拟场景').selectOption('normal')
  await page.getByRole('button', { name: '执行 NX 解析' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  const id = await page.evaluate(
    () => Object.keys(JSON.parse(localStorage.getItem('capptron.simulation.v1')!).tasks)[0]!,
  )
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await page.getByText('恢复已有输入 / 任务', { exact: true }).click()
  await page.getByLabel('恢复任务 ID').fill('sim-task-does-not-exist')
  await page.getByRole('button', { name: '查询已有任务与 CAM' }).click()
  await expect(page.getByRole('alert')).toContainText('任务不可恢复')
  await page.getByLabel('恢复任务 ID').fill(id)
  await page.getByRole('button', { name: '查询已有任务与 CAM' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '02 工艺决策' }).click()
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
  await expect(page.getByRole('navigation', { name: '工序列表' }).getByRole('button')).toHaveCount(
    7,
  )
})

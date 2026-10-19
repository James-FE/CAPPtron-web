import { test, expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

const fixture =
  'SYNTHETIC UI TEST ONLY — NOT EXECUTABLE NC\r\n' +
  Array.from(
    { length: 220 },
    (_, i) => `TEST TEXT ${i + 1}: ${'not machining data / '.repeat(i === 0 ? 30 : 2)}`,
  ).join('\r\n')
async function installFixture(page: Page, status = 200) {
  const catalog = JSON.parse(readFileSync('public/case-catalog/golden-b7/v2.json', 'utf8'))
  // 只替换浏览器响应；发布的 JSON 与字节摘要不改动。
  catalog.case.name = 'Golden-B7 合成 UI 测试'
  catalog.programAssets[0].sha256 = createHash('sha256').update(fixture).digest('hex')
  catalog.programAssets[0].sizeBytes = Buffer.byteLength(fixture)
  const payload = { ...catalog }
  delete payload.contentDigest
  catalog.contentDigest = createHash('sha256').update(canonical(payload)).digest('hex')
  const index = JSON.parse(readFileSync('public/case-catalog/index.json', 'utf8'))
  index.cases[0].versions[0].contentDigest = catalog.contentDigest
  await page.route('**/case-catalog/index.json', (route) => route.fulfill({ json: index }))
  await page.route('**/case-catalog/golden-b7/v2.json', (route) => route.fulfill({ json: catalog }))
  await page.route('**/__local_reference/golden-b7', (route) =>
    route.fulfill({
      status,
      body: status === 200 ? fixture : 'unavailable',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-CAPPtron-Content-Source': 'demo_fixture',
      },
    }),
  )
}
async function enter(page: Page) {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button', { name: '使用示例 Ring_A.step' }).click()
  await expect(page.getByRole('progressbar')).toBeVisible()
  await page.clock.fastForward(4100)
  await page.getByRole('button', { name: '查看工艺规划结果' }).click()
}
async function shot(page: Page, info: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
}
test('审核入口准确空状态及摘要失配，禁止生成伪 NC', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('button', { name: '03 程序审核' })).toHaveAttribute(
    'aria-current',
    'step',
  )
  await expect(page.getByText('参考程序正文暂不可用')).toBeVisible()
  await expect(page.getByRole('button', { name: '打开 Agent 协同' })).toBeVisible()
  await shot(page, info, 'review-default-empty')
  await installFixture(page, 409)
  await enter(page)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByRole('alert')).toContainText('SHA-256')
  await expect(page.getByRole('textbox', { name: 'NC 程序草稿' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '下载程序草稿' })).toHaveCount(0)
  await shot(page, info, 'review-reference-mismatch')
})
test('真实 Chromium 编辑、撤销重做、差异、保存恢复及长行滚动', async ({ page }, info) => {
  await installFixture(page)
  await enter(page)
  await page.getByRole('button', { name: '03 程序审核' }).click()
  const editor = page.getByRole('textbox', { name: 'NC 程序草稿' })
  await expect(editor).toContainText('SYNTHETIC UI TEST ONLY')
  await expect(page.getByText(/不可执行的合成测试文本/)).toBeVisible()
  await expect(page.getByRole('button', { name: '确认可用', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '下载程序草稿' })).toBeDisabled()
  await shot(page, info, 'review-synthetic-loaded')
  await editor.click({ position: { x: 100, y: 20 } })
  await page.keyboard.press('Control+Home')
  await page.keyboard.insertText('HUMAN TEST EDIT\nsecond line\n')
  await expect(page.getByText(/未保存修改/)).toBeVisible()
  await expect(page.getByText(/仅测试 · 不可审核/)).toBeVisible()
  await shot(page, info, 'review-unsaved')
  await page.keyboard.press('Control+z')
  await expect(editor).not.toContainText('HUMAN TEST EDIT')
  await page.keyboard.press('Control+Shift+z')
  await expect(editor).toContainText('HUMAN TEST EDIT')
  await page.getByRole('button', { name: '查看差异', exact: true }).click()
  await expect(page.getByRole('region', { name: '原始程序与当前草稿差异' })).toContainText(
    '+ HUMAN TEST EDIT',
  )
  await shot(page, info, 'review-diff')
  await page.getByRole('button', { name: '保存本次会话草稿' }).click()
  await expect(page.getByText(/已保存本次会话草稿 r4/)).toBeVisible()
  await editor.click({ position: { x: 100, y: 20 } })
  await page.keyboard.press('Control+Home')
  await page.keyboard.insertText('UNSAVED\n')
  await page.getByRole('button', { name: '恢复已保存修订' }).click()
  await expect(editor).not.toContainText('UNSAVED')
  await expect(editor).toContainText('HUMAN TEST EDIT')
  await page.getByRole('button', { name: '查看差异', exact: true }).click()
  await page.getByRole('button', { name: '展开代码' }).click()
  const scroll = page.locator('.cm-scroller')
  await scroll.evaluate((el) => {
    el.scrollLeft = 200
  })
  await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50)
  await scroll.evaluate((el) => {
    el.scrollTop = 3000
  })
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
  await expect(page.getByRole('button', { name: '保存本次会话草稿' })).toBeInViewport({ ratio: 1 })
  await shot(page, info, 'review-expanded-scroll')
  await page.getByRole('button', { name: '恢复原文' }).click()
  await expect(editor).not.toContainText('HUMAN TEST EDIT')
  await expect(page.getByText(/未保存修改/)).toBeVisible()
})
test('工艺与审核共享 Agent、工序、消息输入与程序草稿，模型更换隔离任务', async ({ page }, info) => {
  await installFixture(page)
  await enter(page)
  await page
    .getByRole('navigation', { name: '工序列表' })
    .getByRole('button', { name: /05 内孔精车/ })
    .click()
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  await page.getByLabel('消息', { exact: true }).fill('跨页面演示消息')
  await page.getByRole('button', { name: '发送演示消息' }).click()
  await page.getByLabel('消息', { exact: true }).fill('尚未发送')
  await page.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
  await page.getByRole('button', { name: '03 程序审核' }).click()
  const editor = page.getByRole('textbox', { name: 'NC 程序草稿' })
  await editor.click({ position: { x: 100, y: 20 } })
  await page.keyboard.press('Control+Home')
  await page.keyboard.insertText('KEEP DRAFT\n')
  await page.getByRole('button', { name: '打开 Agent 协同' }).click()
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('尚未发送')
  await expect(page.getByRole('log')).toContainText('跨页面演示消息')
  await expect(page.getByRole('region', { name: 'Agent 当前上下文' })).toContainText('修订 r2')
  await expect(page.getByRole('log')).toContainText('未生成或验证 NC')
  await shot(page, info, 'review-agent-drawer')
  await page.getByRole('button', { name: '关闭 Agent 抽屉' }).click()
  await page.getByRole('button', { name: '返回工艺决策' }).click()
  await expect(page.getByRole('region', { name: '当前工序详情' })).toContainText('内孔精车')
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(editor).toContainText('KEEP DRAFT')
  await page.getByRole('button', { name: '01 模型输入' }).click()
  await expect(page.getByRole('button', { name: '打开 Agent 协同' })).toHaveCount(0)
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'different.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('TEST ONLY'),
  })
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByText('参考程序正文暂不可用')).toBeVisible()
  await expect(editor).toHaveCount(0)
})

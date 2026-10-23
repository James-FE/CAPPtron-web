import { expect, test } from '@playwright/test'

// 原独立工作区已撤除；真实流程合成契约覆盖见 core-prototype.spec.ts。
test('unconfigured original prototype blocks live writes', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url())
  })
  await page.goto('/')
  await page.getByRole('button', { name: '接入真实流程' }).click()
  await expect(page.getByRole('alert')).toContainText('尚未配置')
  await expect(page.getByRole('button', { name: '上传 STEP', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '执行 NX 解析', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '创建工艺规划任务', exact: true })).toBeDisabled()
  expect(writes).toHaveLength(0)
})

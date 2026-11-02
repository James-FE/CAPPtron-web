import { test, expect } from '@playwright/test'
import { integrationSha } from './coreFixture'

test('Core 重启后可备份旧任务并重新选择 STEP', async ({ page }, info) => {
  const key = 'capptron.core.workflow.v1.' + encodeURIComponent('|' + integrationSha)
  await page.addInitScript(
    ({ key }) => {
      if (!localStorage.getItem('recovery-seeded')) {
        localStorage.setItem(
          key,
          JSON.stringify({
            task_id: 'gone-task',
            drafts: { rough: '0.4' },
            pending: {
              domain: 'replan',
              command_id: 'original',
              task_id: 'gone-task',
              expected_version: 1,
              request: { command_id: 'original', base_revision: 1, expected_feedback_version: 0 },
              url: '/planning/tasks/gone-task/replan',
            },
          }),
        )
        localStorage.setItem('recovery-seeded', '1')
      }
    },
    { key },
  )
  const writes: string[] = []
  await page.route('**/planning/tasks/gone-task', async (route) => {
    if (route.request().method() !== 'GET') writes.push(route.request().method())
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 5001, message: 'Algorithm task not found' },
        request_id: 'confirmed-missing',
      }),
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await page.getByRole('button', { name: '重试 / 继续查询', exact: true }).click()
  await expect(page.getByRole('button', { name: '核对旧任务并重新开始' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('旧任务待确认.png'), fullPage: true })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '核对旧任务并重新开始' }).click()
  await expect(
    page
      .getByRole('region', { name: '模型输入' })
      .getByText('旧任务已丢失，本地记录已备份；请选择并上传 STEP'),
  ).toBeVisible()
  const saved = await page.evaluate(
    (key) => ({
      current: localStorage.getItem(key),
      backups: Object.keys(localStorage)
        .filter((k) => k.startsWith(key + '.backup.'))
        .map((k) => JSON.parse(localStorage.getItem(k)!)),
    }),
    key,
  )
  expect(JSON.parse(saved.current!)).toEqual({})
  expect(saved.backups[0]).toMatchObject({
    task_id: 'gone-task',
    drafts: { rough: '0.4' },
    pending: { command_id: 'original' },
  })
  await page.getByLabel('选择 STEP 模型文件').setInputFiles({
    name: 'new.step',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('ISO-10303-21;\nEND-ISO-10303-21;'),
  })
  await expect(page.getByText('new.step', { exact: true }).first()).toBeVisible()
  expect(writes).toEqual([])
  await page.screenshot({ path: info.outputPath('恢复后可更换模型.png'), fullPage: true })
})

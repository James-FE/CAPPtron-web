import { test, expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import { coreFixture, startPlanning, openPlan, approvePlan } from './coreFixture'

async function setup(page: Page) {
  const core = await coreFixture(page, { camWait: true })
  const remote = {
    state: 'reset_required',
    availability: 'observed',
    active: null as string | null,
    status: 'unknown',
    command: '',
    mode: 'success',
    submissions: [] as string[],
    reconciles: 0,
  }
  await page.route('**/cam/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/cam/executor')
      return route.fulfill({
        json: {
          executor_id: 'fixture-executor',
          availability: remote.availability,
          state: remote.state,
          reset_required: remote.state === 'reset_required',
          active_run_id: remote.active,
        },
      })
    if (path === '/cam/executor/reset') {
      remote.command = route.request().postDataJSON().command_id
      remote.submissions.push(remote.command)
      if (remote.mode === 'lost') return route.abort()
      return route.fulfill({
        status: 202,
        json: {
          command: { command_id: remote.command, action: 'reset', executor_id: 'fixture-executor' },
          status: 'submitted',
        },
      })
    }
    if (path.startsWith('/cam/controls/')) {
      expect(path).toContain(remote.command)
      if (path.endsWith('/reconcile')) {
        remote.reconciles++
        if (remote.mode === 'success') {
          remote.status = 'confirmed'
          remote.state = 'idle'
        }
        if (remote.mode === 'rejected') remote.status = 'rejected'
      }
      return route.fulfill({
        json: {
          command_id: remote.command,
          executor_id: 'fixture-executor',
          action: 'reset',
          status: remote.status,
          allowed_actions: remote.status === 'unknown' ? ['reconcile'] : [],
        },
      })
    }
    return route.fallback()
  })
  await startPlanning(page)
  await openPlan(page)
  await approvePlan(page)
  await page.getByRole('button', { name: '运行 Mastercam' }).click()
  await expect(page.getByRole('region', { name: 'CAM 真实进度' })).toBeVisible()
  return { remote, core }
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, fullPage: true })
  await info.attach(name, { path, contentType: 'image/png' })
}

test('按钮位于查询左侧，复位确认后空闲，不重新加工', async ({ page }, info) => {
  const { remote, core } = await setup(page)
  const reset = page.getByRole('button', { name: '复位执行器', exact: true })
  await expect(reset).toBeEnabled()
  const resetBox = await reset.boundingBox()
  const queryBox = await page.getByRole('button', { name: '继续查询 CAM / NC' }).boundingBox()
  expect(resetBox!.x).toBeLessThan(queryBox!.x)
  await screenshot(page, info, 'reset-required')
  await reset.dblclick()
  await expect(page.getByText('复位成功 · 执行器空闲，请手动重新发起加工。')).toBeVisible()
  await expect(reset).toBeDisabled()
  expect(remote.submissions).toHaveLength(1)
  expect(remote.reconciles).toBe(1)
  expect(core.commands.filter((c) => c.path === '/cam/runs')).toHaveLength(1)
  await screenshot(page, info, 'reset-confirmed')
})

test('回执丢失后刷新恢复同一命令，不再次提交', async ({ page }, info) => {
  const { remote } = await setup(page)
  remote.mode = 'lost'
  await page.getByRole('button', { name: '复位执行器', exact: true }).click()
  await expect(page.getByRole('button', { name: '继续查询复位' })).toBeEnabled()
  const original = remote.command
  remote.mode = 'hold'
  await page.reload()
  await page.getByRole('button', { name: '切换真实联调' }).click()
  await page.getByRole('button', { name: '03 程序审核' }).click()
  await expect(page.getByText(`复位待确认 · 命令 ${original}`)).toBeVisible()
  await screenshot(page, info, 'reset-pending-restored')
  remote.mode = 'success'
  await expect(page.getByText('复位成功 · 执行器空闲，请手动重新发起加工。')).toBeVisible()
  expect(remote.submissions).toEqual([original])
})

test('执行器忙碌、不可达或空闲时禁用，重新检查可恢复入口', async ({ page }, info) => {
  const { remote } = await setup(page)
  const reset = page.getByRole('button', { name: '复位执行器', exact: true })
  const check = page.getByRole('button', { name: '检查执行器状态' })
  await expect(reset).toBeEnabled()
  remote.state = 'busy'
  remote.active = 'active-run'
  await check.click()
  await expect(reset).toBeDisabled()
  await expect(page.getByText('执行器忙碌或尚未就绪，暂不可复位。')).toBeVisible()
  await screenshot(page, info, 'reset-busy')
  remote.active = null
  remote.availability = 'unavailable'
  await check.click()
  await expect(page.getByText('执行器暂不可达，请检查 Worker 连接。')).toBeVisible()
  await expect(reset).toBeDisabled()
  remote.availability = 'observed'
  remote.state = 'idle'
  await check.click()
  await expect(page.getByText('执行器空闲，无需复位。')).toBeVisible()
  await expect(reset).toBeDisabled()
  remote.state = 'reset_required'
  await check.click()
  await expect(reset).toBeEnabled()
  expect(remote.submissions).toHaveLength(0)
})

test('明确拒绝后显示修复提示，显式重试才创建新命令', async ({ page }, info) => {
  const { remote } = await setup(page)
  remote.mode = 'rejected'
  await page.getByRole('button', { name: '复位执行器', exact: true }).click()
  await expect(
    page.getByText('复位被拒绝，请核对 Mastercam、基准工程及 IPCServer 后重新复位。'),
  ).toBeVisible()
  const original = remote.command
  await screenshot(page, info, 'reset-rejected')
  expect(remote.submissions).toHaveLength(1)
  remote.mode = 'success'
  remote.status = 'unknown'
  await page.getByRole('button', { name: '重新复位执行器' }).click()
  await expect(page.getByText('复位成功 · 执行器空闲，请手动重新发起加工。')).toBeVisible()
  expect(remote.submissions).toHaveLength(2)
  expect(remote.command).not.toBe(original)
})

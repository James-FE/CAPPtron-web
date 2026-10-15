import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // 工程基础测试必须独立于真实后端与外部网络。
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return url.origin === 'http://127.0.0.1:5173' ? route.continue() : route.abort()
  })
})

test('loads the engineering workspace without runtime errors', async ({ page }, testInfo) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'CNC Agentic Programming', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Frontend project foundation' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Frontend infrastructure is ready for implementation' }),
  ).toBeVisible()
  await expect(page.getByText('UI foundation / No CAM integration', { exact: true })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Planned workflow stages' })
  await expect(navigation).toBeVisible()
  for (const name of ['01 / Model Input', '02 / Process Planning', '03 / Program Review']) {
    await expect(navigation.getByRole('button', { name, exact: true })).toBeInViewport()
  }
  await expect(page.getByRole('article')).toBeInViewport()
  await expect(
    page.getByText('Design baseline: Figma r06. Backend: CAPPtron-core.', { exact: true }),
  ).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  const screenshot = testInfo.outputPath('workspace.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  await testInfo.attach('workspace', { path: screenshot, contentType: 'image/png' })
  expect(runtimeErrors, 'Uncaught browser runtime errors').toEqual([])
})

test('switches workflow selection and matching details', async ({ page }) => {
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: 'Planned workflow stages' })
  const detail = page.getByRole('article')
  const stages = [
    {
      name: '01 / Model Input',
      detail: 'Model selection and structured input will be implemented in P0.',
    },
    {
      name: '02 / Process Planning',
      detail: 'Operations, steps, parameters, and resources will use dynamic task data.',
    },
    {
      name: '03 / Program Review',
      detail: 'NC review is distinct from process-card approval and CAM verification.',
    },
  ]

  await expect(
    navigation.getByRole('button', { name: stages[0].name, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  // 最后返回初始阶段，以发现只能单向切换的状态问题。
  for (const stage of [stages[1], stages[2], stages[0]]) {
    await navigation.getByRole('button', { name: stage.name, exact: true }).click()
    for (const candidate of stages) {
      await expect(
        navigation.getByRole('button', { name: candidate.name, exact: true }),
      ).toHaveAttribute('aria-pressed', String(candidate.name === stage.name))
    }
    await expect(detail.getByRole('heading', { name: stage.name, exact: true })).toBeVisible()
    await expect(detail.getByText(stage.detail, { exact: true })).toBeVisible()
  }
  expect(runtimeErrors, 'Uncaught browser runtime errors').toEqual([])
})

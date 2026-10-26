import { integrationSha } from './e2e/coreFixture'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    browserName: 'chromium',
    // 本机 Chromium 网络兼容开关；CI 默认不启用，不改变断言或重试。
    launchOptions:
      process.env.CAPPTRON_E2E_NETWORK_COMPAT === '1'
        ? { args: ['--disable-features=TcpPortRandomizationWin'] }
        : undefined,
    baseURL: 'http://127.0.0.1:5183',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium-1920x1080', use: { viewport: { width: 1920, height: 1080 } } },
    { name: 'chromium-1440x900', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    env: {
      VITE_CORE_INTEGRATION_CONFIG_URL: '/frontend-integration.v1.json',
      VITE_CORE_INTEGRATION_CONFIG_SHA256: integrationSha,
    },
    command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})

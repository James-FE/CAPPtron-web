import { defineConfig } from '@playwright/test'
import base from './playwright.config'
import { configSha } from './e2e/fixtures/corePrototype'

export default defineConfig({
  ...base,
  testMatch: 'core-prototype.spec.ts',
  testIgnore: [],
  outputDir: 'test-results-core-prototype',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-core-prototype', open: 'never' }],
  ],
  webServer: {
    ...base.webServer,
    command: 'npm run dev -- --mode e2e --host 127.0.0.1 --port 5183 --strictPort',
    env: {
      VITE_CORE_INTEGRATION_CONFIG_URL: '/synthetic-integration.json',
      VITE_CORE_INTEGRATION_CONFIG_SHA256: configSha,
    },
  },
})

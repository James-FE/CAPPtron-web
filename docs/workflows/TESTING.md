# 测试策略（工程基础阶段）

当前仓库具备 React 组件测试、Node 工程脚本离线测试及 Playwright Chromium Smoke Test。**这些测试覆盖的是工程基础页面，不等于 Figma r06 业务流程已经通过验收。**

## 本地静态检查与单元测试

```bash
npm ci
npm run verify:repo
npm run lint
npm run format:check
npm run typecheck
npm run test:ci
npm run test:infra
npm run build
```

也可以执行 `npm run quality` 跑基础检查、Lint、格式、类型、Vitest 和构建；`test:infra` 在 GitHub Actions 中另行执行。仓库已提交锁文件，正常安装使用 `npm ci`；仅依赖发生变化时才运行 `npm install` 并更新锁文件。

## Playwright 浏览器测试

```bash
npx playwright install chromium
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:report
```

Linux CI 使用 `npx playwright install --with-deps chromium` 安装必要系统依赖。Playwright 通过 `webServer` 自动启动 Vite，在 **1920×1080** 与 **1440×900** 下运行实际 Chromium。现有用例涵盖页面加载、运行时异常、关键元素可见性、横向溢出与工作流选项切换。

截图及失败诊断在 `playwright-report/` 与 `test-results/` 中；PR 的 `Chromium E2E` Job 上传报告 Artifact。截图**不是已验收的视觉基准**，不得以自动测试替代 Figma 对比及人工检查。

## 下一阶段需要补充的覆盖范围

P0 实现 r06 后，应根据真实组件增加动态工序列表（零道/一道/多道）、缺失工步与参数、参数来源、Agent 抽屉位置记忆、Mock 审核语义、空/加载/失败状态，以及完整的用户交互流程。视觉回归快照应在人工确认页面质量后建立。

目前 CI 的工程基础测试不依赖真实后端。与 `CAPPtron-core` 的集成测试，需在 HTTP 端点、Schema 版本及实际响应经过核验后单独补充。

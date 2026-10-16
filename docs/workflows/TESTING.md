# 测试策略（FE-001 模型输入页）

当前仓库具备 React 组件测试、Node 工程脚本离线测试及 Playwright Chromium 测试。测试覆盖 FE-001 全局 Shell 与模型输入页；其他业务页面未实现。**自动化通过不等于 Figma 对照或人工视觉验收通过。**

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

Linux CI 使用 `npx playwright install --with-deps chromium` 安装必要系统依赖。Playwright 通过 `webServer` 自动启动 Vite，在 **1920×1080** 与 **1440×900** 下运行实际 Chromium。用例涵盖初始阶段、真实文件选择器、本地选择/更换/取消、长文件名、同名文件重选、无效格式、拖放、Demo 来源切换和未实现入口反馈。每例监测运行时异常与意外上传请求；主要状态检查横向溢出，初始状态对关键控件做可见性和实际命中测试以发现遮挡。

Vitest 覆盖同样的核心状态，并补充无扩展名、伪装后缀、多文件拖放和取消事件。文件仅作为测试输入，不需要真实 CAD 内容；不使用其内容冒充已解析模型。浏览器测试用 `filechooser` 事件验证原生文件选择入口，用清空文件列表模拟取消后的无选择状态；操作系统对话框的外观由人工查看。

截图及失败诊断在 `playwright-report/` 与 `test-results/` 中；PR 的 `Chromium E2E` Job 上传报告 Artifact。截图**不是已验收的视觉基准**，不得以自动测试替代 Figma 对比及人工检查。

## 下一阶段需要补充的覆盖范围

P0 实现 r06 后，应根据真实组件增加动态工序列表（零道/一道/多道）、缺失工步与参数、参数来源、Agent 抽屉位置记忆、Mock 审核语义、空/加载/失败状态，以及完整的用户交互流程。视觉回归快照应在人工确认页面质量后建立。

目前 CI 的前端测试不依赖真实后端。与 `CAPPtron-core` 的集成测试，需在 HTTP 端点、Schema 版本及实际响应经过核验后单独补充。

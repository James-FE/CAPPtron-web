# CAPPtron-web

CAPPtron CNC Agentic Programming 项目的 Web 前端，技术基础为 **React + TypeScript + Vite**。

**当前状态：FE-001 全局 Shell 与模型输入页，待人工视觉验收。** 页面支持本地 STEP / STP 文件选择、更换、拖放和 Demo 输入元数据展示；文件仅保留在当前页面内存中，刷新后重置。没有服务器上传、STEP 解析、真实 Agent 规划、CAM、NC 或 Mastercam 能力。工艺决策、程序审核、数据底座和文件解读入口仅显示未实现说明。业务设计基准与实施边界见 [前端架构说明](docs/architecture/frontend-architecture.md)。

## 设计与相关仓库

- [Figma r06 设计](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK)
- [CAPPtron-core 后端](https://github.com/James-FE/CAPPtron-core)
- [工程参考仓库](https://github.com/cosmic-snail/CAPPtron-core)

当前产品决策：**先高保真实现 r06，r07 布局重设计暂缓**。UI 是否完成以浏览器实际使用与人工验收为准，不能仅凭 CI 通过判定。

## 本地开发

需要 **Node.js 22.12+** 与 npm。仓库已有 `package-lock.json`，正常拉取代码后使用可复现安装：

```bash
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173`。Vite 在开发服务器运行时支持 HMR（热更新），修改 React 或 CSS 文件后通常会自动更新浏览器；结束运行使用 `Ctrl+C`。

常用工程检查：

```bash
npm run quality
npm run build
npm run preview
```

`npm run quality` 包含仓库基础检查、ESLint、Prettier、TypeScript、Vitest 和生产构建；GitHub Actions 另运行 Node 工程脚本离线测试及浏览器 E2E。生产构建输出位于 `dist/`，它是静态 Web 资源，并非 Python 包。

新增或升级 npm 依赖时，使用 `npm install` 并同时提交 `package.json` 与 `package-lock.json`。

## Playwright 浏览器验收

首次安装 Chromium 浏览器依赖：

```bash
npm ci
npx playwright install chromium
```

在 Linux / CI 中，如需系统级依赖：

```bash
npx playwright install --with-deps chromium
```

运行测试与查看报告：

```bash
npm run test:e2e
npm run test:e2e:ui
npm run test:e2e:report
```

Playwright 会通过 `webServer` 自动启动 Vite（本地可复用已在运行的 `127.0.0.1:5173` 服务；CI 不复用）。`npm run test:e2e -- --headed` 可显示 Chromium 测试窗口。Chromium 浏览器文件在本机 Playwright 缓存中，不提交到 Git。

`e2e/smoke.spec.ts` 覆盖 FE-001 模型输入页，在 **1920×1080** 和 **1440×900** 两种桌面视口检查页面加载、运行时错误、控件可见性与遮挡、横向溢出、文件选择器、更换与取消、长文件名、非法格式、拖放、Demo 来源及未实现入口的鼠标/键盘反馈。测试同时确认没有上传请求，不依赖真实 FastAPI、Mastercam 或外部服务。通过测试仍不代表人工视觉验收通过。

- 初始、本地文件、Demo 三种状态的真实截图作为附件出现在 `playwright-report/index.html`，原始 PNG 位于 `test-results/` 各视口目录，分别名为 `model-input-empty.png`、`model-input-local.png`、`model-input-demo.png`。
- 失败时可查看错误、截图与 `trace.zip`；使用 `npx playwright show-trace <trace.zip的实际路径>` 调试。
- GitHub PR 的 **Quality / Chromium E2E** Job 会上传 `playwright-results` Artifact（保留 14 天）。下载、解压后可用 `npx playwright show-report <解压后playwright-report目录>` 查看。
- 当前截图是**运行证据，不是已批准的视觉回归基准**。只有页面对照 Figma 并经人工验收后，才建立 `toHaveScreenshot` 基准。

FE-001 的设计来源、组件边界、对照方法及有意的状态文案差异见 [FE-001 验收说明](docs/workflows/FE-001-ACCEPTANCE.md)。后续页面任务再补充工艺决策、动态工序、Agent 抽屉和审核操作测试，这些能力不属于 FE-001。

## GitHub 自动检查与分支协作

- `.github/workflows/quality.yml`：PR 及 `main` Push 时运行 **Frontend Quality**（基础、格式、类型、单测、构建、工程脚本）与独立 **Chromium E2E** 两个 Job。
- `.github/workflows/package.yml`：`main` Push 或手动触发时打包并上传 `dist/`（保留 30 天）。
- `.github/rulesets/main.json`：目标分支保护策略；**提交 JSON 本身不会使远程规则自动生效**。
- `AGENTS.md`：Codex 开发与审查规则；**仓库中存在审查规则不意味着云端自动 Code Review 已启用**。
- 前端功能优先在独立 `feat/*` 分支开发，PR 提交至 `develop/r06-ui`；未经维护者明确批准不得合并至 `main`。

详见 [贡献指南](CONTRIBUTING.md)、[GitHub 配置与分支保护](docs/workflows/GITHUB_SETUP.md)、[Codex 审查配置](docs/workflows/CODE_REVIEW.md) 以及 [测试说明](docs/workflows/TESTING.md)。

## GitHub 初始化与规则管理（历史/维护工具）

`scripts/bootstrap-github.ps1` 是**首次创建仓库**时使用的初始化脚本：安装依赖、运行检查、初始化 Git 并创建/推送远程仓库（新建时默认请求 Private 可见性）。**当前 GitHub 仓库已存在且公开，不应为了正常开发重复运行初始化脚本**；它也不会自动把现有公开仓库变为私有。

需要维护 Ruleset 时，在 Windows PowerShell 中先运行只读计划：

```powershell
.\scripts\configure-ruleset.ps1
.\scripts\configure-ruleset.ps1 -Mode Check
```

只有确认变更并具备权限时，才运行 `.\scripts\configure-ruleset.ps1 -Mode Apply`，根据提示输入 `APPLY`。私有仓库的部分 Ruleset 能力可能取决于 GitHub 计划。以 GitHub 远程规则的实际状态为准，不以文件存在推断已启用。

## 前后端与 CAM 安全边界

- 浏览器只通过 `CAPPtron-core` 暴露的 FastAPI 接口访问业务，不直连 Mastercam、SSH、Windows Worker 或 CAM SDK。
- 任务、工序、修订和反馈的权威 ID 与状态由后端提供。
- **工艺卡审批、NC 程序人工确认、仿真验证及加工安全是不同概念**，不得混用。
- 演示 Fixture、Mock NC 和模拟 Agent 回复不得伪装成真实制造结果。
- 优先完成 P0 动态业务 UI；STEP 三维预览属于后续增强内容。

开始实现页面之前，请阅读 [前端架构说明](docs/architecture/frontend-architecture.md)。

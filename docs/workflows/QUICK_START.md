# CAPPtron-web 快速启动指南

适用于 `develop/r06-ui` 开发集成分支，核对日期：2026-10-21。

## 已有本地工程：直接启动

在 Windows PowerShell 中运行：

```powershell
Set-Location 'D:/GPT_workspace/CNC_project/CAPPtron-web'
npm run dev
```

其他电脑请替换为自己的工程目录。终端出现 Vite 的 `Local` 地址后，打开 **[http://127.0.0.1:5173/](http://127.0.0.1:5173/)**。

保留这个终端即可持续使用；停止服务按 `Ctrl+C`。修改 React、TypeScript 或 CSS 后通常会自动热更新。若本工程服务已经运行，直接访问地址，无需重复启动。

只有首次安装、依赖变化或 `node_modules` 缺失时，才需要先执行：

```bash
npm ci
```

## 首次在另一台电脑运行

需要 Git、Node.js 22.12+ 与 npm。推荐 Node.js 22.x，与仓库 `.nvmrc` 和 CI 一致。可先检查环境：

```bash
git --version
node --version
npm --version
```

克隆当前开发版本并启动：

```bash
git clone --branch develop/r06-ui https://github.com/James-FE/CAPPtron-web.git
cd CAPPtron-web
npm ci
npm run dev
```

`npm ci` 使用提交的锁文件安装依赖，需要能访问 npm 包源。不要对已存在的目录再次执行 clone。`main` 是稳定集成分支，开发功能可能尚未全部同步到 main。

普通前端 Demo **无需数据库、Python、CAPPtron-core、Mastercam、模型 API 凭据或 `.env` 配置**。`.env.example` 中的地址不是启动前置条件，也不表示后端联调已经完成。

## 启动后可以查看什么

1. 在模型输入页选择本地 STEP/STP，或点击“使用示例 Ring_A.step”。本地选择不会上传或解析 CAD。
2. 示例进入工艺决策，可查看工程参考方案、工序、资源和参数，填写演示现场字段，使用 Agent 演示交互。
3. 通过顶部程序审核导航查看当前状态，或填写必要演示字段后点击“查看参考程序并进入审核”。没有匹配的本机 NC 正文时显示不可用说明，属于正常状态，不影响其他页面启动。
4. FE-004A 提供数据契约、Mock 和读取接口；数据底座大屏尚未实现，因此导航入口暂不可用。可用下面命令验证数据层及其调用示例。

```bash
npm run validate:foundation
npm run example:foundation
```

模型文件选择、现场草稿、Agent 对话和程序编辑会话保存在浏览器内存中，刷新页面会重置。Mock 和历史参考不代表真实 Agent、CAM、模型服务或加工验证。

## 获取后续更新

先检查分支和本地修改：

```bash
git status
git branch --show-current
git fetch origin
```

如果当前在自己的功能分支，按该分支流程更新，不要直接覆盖或丢弃未提交修改。若只是体验集成版、工作区已妥善保存且可切换到 `develop/r06-ui`：

```bash
git switch develop/r06-ui
git pull --ff-only origin develop/r06-ui
```

快进失败时先检查本地提交，勿用强制 reset 绕过。如果依赖文件有变化，停止开发服务后执行 `npm ci`，再运行 `npm run dev`。

## 构建结果预览

在工程根目录执行：

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

打开 **[http://127.0.0.1:4173/](http://127.0.0.1:4173/)**。停止同样使用 `Ctrl+C`。`dist/` 是生成的静态 Web 资源；preview 不会随源码修改自动重建，修改后需重新 build。它也不提供本机开发模式的私有 NC 读取端点。

## 可选：读取匹配的 Golden-B7 历史 NC

这不是启动必需步骤。仅当你已拥有与已发布 Golden-B7 v2 元数据匹配的冻结文件，并确实需要查看该正文时配置。

在工程根目录的 `.env.development.local` 中新增或更新下列变量；已有其他设置应保留。将占位文本替换为自己电脑上的绝对路径，Windows 路径建议使用正斜杠：

```dotenv
CAPPTRON_GOLDEN_B7_NC=<本机冻结文件的绝对路径>
```

保存后重启 `npm run dev`。文件大小及 SHA-256 必须与已发布案例元数据一致，否则读取会明确失败。不要修改案例摘要来绕过校验，不要将 NC 文件或私有路径提交到 Git；这个变量不能改成 `VITE_` 前缀。服务保持本机 `127.0.0.1` 访问。

正文不可用时仍可查看参考工艺和来源信息。详细边界见 [FE-003 验收说明](FE-003-ACCEPTANCE.md)。

## 常见问题

### 找不到 npm 或 Node.js 版本不满足要求

安装符合要求的 Node.js 后重新打开终端，运行 `node --version` 与 `npm --version`。确认当前目录包含 `package.json`，再执行安装和启动命令。

### PowerShell 提示无法加载 npm.ps1

可以直接使用 Windows 命令入口，无需修改系统执行策略：

```powershell
npm.cmd ci
npm.cmd run dev
```

### 提示 vite 不存在或依赖缺失

在工程根目录执行 `npm ci`，成功后再启动。不要通过全局安装 Vite 或删除锁文件解决版本不一致；包源访问失败应先处理终端中报告的网络或代理问题。

### 5173 端口被占用

先打开 [现有地址](http://127.0.0.1:5173/)，确认是否已是本工程。可以继续复用，或到原启动终端按 `Ctrl+C` 停止。若占用者不是本工程，可用另一个本机端口：

```bash
npm run dev -- --port 5174
```

然后访问 [http://127.0.0.1:5174/](http://127.0.0.1:5174/)。工程启用 `strictPort`，端口冲突会明确报错，不会悄悄换端口；不要为了启动而结束未知进程。

### 浏览器连接失败或页面未更新

确认启动终端仍在运行，并以终端显示的 `Local` 地址为准。第一次依赖转换可能稍慢；若终端报告编译错误，先处理该错误。预览模式需要重新 build；修改 `.env.development.local` 后需要重启开发服务。

### 数据底座入口不可用，或程序审核没有正文

当前阶段分别对应“FE-004B 页面尚未实现”和“未配置匹配的本机参考正文”，不是服务启动失败。数据层能力可通过前面的独立验证命令检查；不要期待启动前端就具备真实模型调用或 NC 生成能力。

## 开发者验证命令

```bash
npm run quality
npm run validate:catalog
npm run validate:foundation
npm run test:infra
```

首次运行浏览器测试需安装 Chromium，然后执行：

```bash
npx playwright install chromium
npm run test:e2e
```

Linux / CI 可使用 `npx playwright install --with-deps chromium`。测试会自动启动独立的 **127.0.0.1:5183** 服务，使用 `e2e` 模式，且不复用已有服务；不需要手动先启动 5183。日常开发 5173、构建预览 4173、测试 5183 各自独立。报告通过 `npm run test:e2e:report` 查看。

更完整的领域与读取契约见 [数据底座 v1](../architecture/data-foundation-v1.md)，代码协作约定见 [贡献指南](../../CONTRIBUTING.md)。

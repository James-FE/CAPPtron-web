# 本机真实联调 Quick Start

本指南说明已经配置好 NX、Mastercam 和 Core 的 Windows 测试机，如何启动网站、恢复上一轮，以及重新开始测试。前端独立演示与首次克隆见[前端快速启动](QUICK_START.md)。

## 1. 启动前确认

真实联调链路为 Web → Core → Worker → Mastercam。需要三个服务终端，分别运行 Core、Worker、Web；Mastercam 使用同一普通用户的已解锁交互桌面。

最新 Web 使用 `template-request-v2`。Core 必须包含对应选模与结果快照能力，不能只更新前端。2026-11-04 本机跑通基线为 Core `faf4482`（含 #199、#224 的 v2/日志修复、#214 复位、#219 编码修复）＋ Web `c204994`。后续使用包含这些能力的版本；不要把未合入 PR 当作任意 main 已具备的功能。

下列路径是本机已配置环境，不是新机器安装器：

- Core：`D:/GPT_workspace/CNC_project/core-fullflow-20261104`
- Web：`D:/GPT_workspace/CNC_project/web-pr214-pr219-live-20261104`
- 配置：`D:/GPT_workspace/CNC_project/local-fullflow-20261104`

这些目录、配置和制造资产不随 Web 仓库提供。其他电脑替换为自己的已部署路径，并先按 [Core Windows 运行与恢复说明](https://github.com/cosmic-snail/CAPPtron-core/blob/main/docs/integrations/mastercam-windows.md) 配置 NX、SDK、编译器、后处理、工程策略和基准文件。本机使用 localhost，无需 Tailscale。

已有服务运行时直接复用，不重复启动；停止自己管理的服务使用原终端 `Ctrl+C`，不要结束未知进程。

## 2. 终端一：启动 Core

```powershell
Set-Location 'D:/GPT_workspace/CNC_project/core-fullflow-20261104'
# 首次安装或依赖变化时执行
uv sync --locked --extra cam-ssh
uv run --locked capptron serve --env-file 'D:/GPT_workspace/CNC_project/local-fullflow-20261104/core.env'
```

本机 Core 地址为 `http://127.0.0.1:8411`。保留已有 `core.env` 的完整配置，核对以下项目，不要用本节内容覆盖整个文件：

- `CAPPTRON_HTTP_HOST=127.0.0.1`、`CAPPTRON_HTTP_PORT=8411`。
- `CAPPTRON_CORS_ORIGINS` 包含 Web 的实际 origin，本例为 `http://127.0.0.1:5185`。端口、`localhost` 与 `127.0.0.1` 都必须匹配。
- `CAPPTRON_ALGORITHM_PROVIDER=template`，以及现成的 NX 和工程策略配置。
- 运行 CAM 时使用 `CAPPTRON_CAM_ENABLED=true` 和可信执行 profile；输出编码按该后处理的实际证据配置。
- `CAPPTRON_TASK_STATE_DIRECTORY` 指向稳定任务状态目录。CAM records、归档和客户端缓存也保留原目录；浏览器缓存不能代替 Core 的任务持久化。

配置、凭据及制造文件不提交到 Web 仓库。

## 3. Mastercam 与终端二：启动 Worker

首次启动或需要复位时，先保存需要保留的工程，启动专用 Mastercam，打开 `worker.json` 指定的零工序基准工程，确认 IPCServer 已加载。本机基准为：

```text
D:/GPT_workspace/CNC_project/integration-20261027/runtime/reset-baseline.mcam
```

不要随意替换基准文件或修改其摘要。模拟器执行期间保持窗口可见，避免操作它。

在 Mastercam 所在的同一用户、同一交互桌面运行以下命令。PowerShell 模块路径和执行策略环境变量仅作用于该终端及其子进程，使用本机已验证的启动配置：

```powershell
Set-Location 'D:/GPT_workspace/CNC_project/core-fullflow-20261104'
$mastercamHosts = @(Get-Process -Name Mastercam -ErrorAction Stop)
if ($mastercamHosts.Count -ne 1) { throw '请先确认只运行一个专用 Mastercam 实例。' }
$mastercamPid = $mastercamHosts[0].Id
$env:PSModulePath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;$env:ProgramFiles\WindowsPowerShell\Modules"
$env:PSExecutionPolicyPreference = 'RemoteSigned'
uv run --locked python -m capptron.infrastructure.mastercam.worker_cli --config 'D:/GPT_workspace/CNC_project/local-fullflow-20261104/worker.json' serve --host-pid $mastercamPid --scripts-root 'D:/GPT_workspace/CNC_project/core-fullflow-20261104/integrations/mastercam/windows'
```

Worker、原生模板与观察脚本必须同批部署，`worker.json` 的资源路径与之匹配。一个专用 Mastercam 只连接一个 Worker。更换 Worker 版本前确认没有在途任务，再停止旧服务；保留原工作区和失败记录。

## 4. 终端三：启动 Web

需要 Node.js 22.12+ 和 npm。在新终端执行：

```powershell
Set-Location 'D:/GPT_workspace/CNC_project/web-pr214-pr219-live-20261104'
# 首次安装、依赖变化或 node_modules 缺失时执行
npm ci
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8411'
npm run dev -- --host 127.0.0.1 --port 5185 --strictPort
```

打开 **[http://127.0.0.1:5185/](http://127.0.0.1:5185/)**，点击顶部「切换真实联调」，确认标识为「真实 Core API」。不要使用 `?mode=simulation` 做真实测试。

v2 前端从 Core 规划结果读取模板和规则，不需要设置旧的 `VITE_CORE_INTEGRATION_CONFIG_*` 让浏览器选模。所有 `VITE_` 变量都对浏览器公开，不可填写凭据。

Web 地址和端口应固定。换端口会使用另一套浏览器恢复记录，也需要同步 Core 的 CORS origin。修改启动环境后重启对应服务，仅刷新页面不会生效。

检查连通：

```powershell
(Invoke-WebRequest 'http://127.0.0.1:5185/').StatusCode
Invoke-RestMethod 'http://127.0.0.1:8411/cam/executor'
```

Web 应返回 200。进入 CAM 前，执行器应为 `availability=observed`、`state=idle`、`active_run_id=null`、`reset_required=false`。不可用不能当作空闲；提示需要复位时按后文处理。

页面按以下顺序操作：选择 STEP → 上传 → 执行 NX 解析 → 创建任务并规划（解析后也可能自动发起）→ 填写现场信息并提交重规划 → 填写审核人并批准工艺卡 → 运行 Mastercam → 查询 NC → 完成精确版本审核后下载。

工艺批准、NC 确认与制造验收分别进行。软件回归使用明确的测试身份；生成或下载 NC 不代表制造安全或机床编码兼容验收。

## 5. 关闭网站后恢复上一轮

关闭网页不会自动取消已下发的 CAM；重新打开也不会默认新建任务。

1. 使用同一个浏览器配置、同一个 origin 重新打开，例如一直使用 `http://127.0.0.1:5185/`。不要混用另一端口、`localhost` 或无痕窗口。
2. 点击「切换真实联调」，页面会尝试读取本地恢复记录并查询原任务。
3. 点击「02 工艺决策」查看工艺；已进入 CAM 的，点击「03 程序审核」继续查询或读取 NC。
4. 若显示未决原请求，按「重试 / 继续查询」恢复原命令。上传恢复要求重新选择文件时，提供原文件；文件名、大小和摘要须匹配，不直接创建第二次提交。

未自动恢复时，在「01 模型输入」展开「恢复已有输入 / 任务」：

- **已有任务**：填写原任务 ID，点击「查询已有任务与 CAM」。这里填任务 UUID，不是 CAM run ID。
- **只有已解析输入**：填写原资产 ID 和解析命令 ID，点击「复用已验证解析」。这会读取原报告，不表示重新运行了 NX。

恢复前先不要点「更换文件」。其他未提交草稿先妥善保留，界面可能阻止切换身份；审核人声明需要重新核对。

若返回 `404 / 5001 Algorithm task not found`，当前 Core 没有该任务。常见于以前未开启任务持久化就重启 Core，或换了服务、数据目录。先确认是否连接原 Core；确认任务丢失后，按页面提供的备份/恢复入口处理，或保留草稿后从原 STEP 新建。不要删除缓存或 Worker 恢复文件来消除报错。

## 6. 成功结束后开始新一轮

不用刷新：

1. 确认上一轮已经结束，Worker idle、无需复位。
2. 点击「01 模型输入」→「更换文件」。
3. 重新选择 STEP；同一文件也能再次选择。
4. 重新上传、解析、规划、批准和运行，产生新的任务及运行身份。

刷新会尝试恢复原记录，不能当作“新建一轮”。更换输入会切换当前会话；已有服务端历史不会变成新任务的结果。有未提交草稿时会提示是否丢弃；有活动 CAM 或未决命令时，先查询并收尾。

成功结束后不需要每轮复位或重启 Mastercam。只有明确提示需要复位时，先保存工程、重启专用 Mastercam、打开配置中的基准工程并确认 IPCServer，然后使用程序审核页「复位执行器」。复位 confirmed 且 Worker idle 后再运行。回复丢失时继续查询原复位命令，不连续提交多个复位。

## 7. 常见问题与参考

- **端口被占用**：先确认是否已有本工程服务；否则换端口并同步 CORS。`--strictPort` 会明确报错，不要结束未知进程。
- **不支持 v2**：核对实际 Core 代码/安装包；重启 Web 不能升级后端协议。
- **Worker unavailable / reset_required**：检查宿主、IPCServer、同用户交互桌面与原命令，按 Core 恢复说明处理。
- **npm.ps1 无法加载**：使用 `npm.cmd ci`、`npm.cmd run dev -- --host 127.0.0.1 --port 5185 --strictPort`。
- **vite 不存在**：在正确 Web 目录执行 `npm ci`，保留锁文件，不全局安装 Vite。

相关入口：

- [前端独立演示、首次克隆与构建预览](QUICK_START.md)
- [前端测试指南](TESTING.md)
- [Golden 历史接入与恢复说明](../api/Golden-demo-integration-20261025.md)（旧描述符流程以其记录版本为准）
- [Core Windows 运行与恢复说明](https://github.com/cosmic-snail/CAPPtron-core/blob/main/docs/integrations/mastercam-windows.md)

更新前先检查 `git status` 与分支，保留本地修改再获取更新；真实联调同时核对 Core、Worker、脚本与 Web。不要将 `git pull` 当作自动切换到已验收组合版本。

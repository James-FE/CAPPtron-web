# CAM 执行页复位入口

日期：2026-11-03。前端基线：`d23a9fc`；关联 [Issue #47](https://github.com/James-FE/CAPPtron-web/issues/47)。

真实 CAM 执行页底部，在“继续查询 CAM / NC”左侧新增“复位执行器”，旁边提供状态检查。只有 Core 当前观测为 `reset_required`、明确要求复位且没有活跃运行时才能提交；点击时再查询一次，最终准入仍由 Core 决定。HTTP 409 本身不代表需要复位。模拟模式不显示真实复位入口。

前端仅使用 Core 已有接口，未修改后端契约：

- `GET /cam/executor`：当前执行器健康。
- `POST /cam/executor/reset`：仅提交一次新的复位命令。
- `GET /cam/controls/{command_id}`：查询原命令。
- `POST /cam/controls/{command_id}/reconcile`：仅在原命令允许时核对结果。

操作者先保存工程、重启专用 Mastercam、打开配置的基准工程，确认 IPCServer 已加载（可配置随 Mastercam 启动）。页面不会启动或关闭 Mastercam，也不会自动重新加工、批准 NC 或把原运行改成成功。复位后仍需核对原运行及其恢复要求。

复位身份在发送前写入浏览器存储，按 Core 地址隔离，不覆盖规划和加工的命令日志。同源标签页通过 Web Locks 串行处理；需支持 Web Locks 的浏览器及 HTTPS 或 localhost 安全上下文。禁止浏览器存储或恢复记录损坏时停止操作。清除站点数据会丢失此浏览器的恢复入口，须先核对 Core 原命令，不能用清除记录来重试。

回执丢失、刷新或重新进入执行页时，只查询原命令，不重新提交；自动查询最多 30 轮，单请求期限 15 秒，未确认后保留“继续查询复位”入口。Core 丢失原记录或回执身份不一致时停止并保留命令 ID。只有明确拒绝后，用户点击“重新复位执行器”才创建新身份。成功要求原复位回执为 `confirmed`，且同一执行器当前观测为空闲、没有活跃运行且无需复位。

## 验证

Windows 本机执行：

```powershell
npm run quality
$env:CAPPTRON_E2E_NETWORK_COMPAT='1'
npm run test:e2e -- --workers=2
```

- `quality` 通过：ESLint、Prettier、TypeScript、370 个 Vitest 测试及生产构建通过（构建保留大于 500 kB 的 chunk 提示）。
- 完整 Playwright：132 个测试通过，覆盖 1920×1080 和 1440×900。其中新增复位用例共 8 个，验证按钮位置、重复点击只提交一次、回执丢失后刷新恢复、忙碌/不可达/空闲禁用、明确拒绝后显式重试。
- 新增接口层测试 12 个，另覆盖存储失败/损坏、Core 记录缺失、身份不匹配、已确认但仍忙碌、原命令 reconcile 和 Core 地址隔离。
- 已人工检查下列实际 Chromium 截图，按钮处于查询按钮左侧，状态提示、底部操作及 Agent 入口可见，无横向页面溢出。测试使用合成 HTTP 数据，不是制造验收证据。
- 对本机 Core 8411 只读核对：`/cam/executor` 返回 `idle`、`reset_required=false`；既有复位回执含 `action=reset`、`status=confirmed`、相同执行器身份。本次未从新增页面触发真实 Mastercam 复位或 CAM 加工；实际故障环境的端到端人工验收仍待进行。

## 截图

[1920×1080 待复位](executor-reset-evidence/chromium-1920x1080/reset-required.png) · [1920×1080 已确认](executor-reset-evidence/chromium-1920x1080/reset-confirmed.png)

[1440×900 待复位](executor-reset-evidence/chromium-1440x900/reset-required.png) · [1440×900 已确认](executor-reset-evidence/chromium-1440x900/reset-confirmed.png)

其余拒绝、忙碌、刷新恢复截图与 HTML 报告由 Playwright 保存到 `test-results` 和 `playwright-report`，不覆盖历史验收图片。

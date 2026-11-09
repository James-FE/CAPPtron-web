# CAM 拒绝与复位未知提示核验

日期：2026-11-09；Web 基线 `065b4e7`，核验范围为本 PR 的提示及审批状态保留。

409 / 8302 显示“CAM 状态冲突，请检查执行器状态及当前工艺版本”，保留原始 HTTP 状态、错误码和 request ID，不将该拒绝解释为审批失效；返回工艺决策页仍能识别原审批。错误屏障继续保留，页面不自动重发加工命令。

8101 提示维护人员检查资源或契约部署，同时保留 Core 原始错误和运行身份；复位待确认时引导继续查询原命令、检查 Worker 恢复日志，不重复提交或删除恢复记录。页面不推断具体历史文件损坏原因。

## 本轮验证

- `npm run quality` 通过：374 个 Vitest 测试、静态检查、类型检查与构建通过；保留既有大 chunk 提示。
- 修订测试后再次通过 lint、typecheck、format:check。
- `npm run test:e2e -- e2e/cam-recovery-errors.spec.ts e2e/executor-reset.spec.ts --workers=2`：12 项通过，覆盖两种桌面视口。
- 人工检查本页链接的 Chromium 截图：提示可见，操作入口与 Agent 按钮未遮挡。这些用例使用合成 HTTP 回执，不调用真实 Worker 或 Mastercam，不构成实机或制造验收。

## 截图

| 状态 | 1920×1080 | 1440×900 |
| --- | --- | --- |
| CAM 准入冲突 | [截图](cam-recovery-errors-evidence/chromium-1920x1080/cam-conflict.png) | [截图](cam-recovery-errors-evidence/chromium-1440x900/cam-conflict.png) |
| 契约失败 | [截图](cam-recovery-errors-evidence/chromium-1920x1080/cam-contract.png) | [截图](cam-recovery-errors-evidence/chromium-1440x900/cam-contract.png) |
| 原复位命令恢复 | [截图](cam-recovery-errors-evidence/chromium-1920x1080/reset-pending-restored.png) | [截图](cam-recovery-errors-evidence/chromium-1440x900/reset-pending-restored.png) |

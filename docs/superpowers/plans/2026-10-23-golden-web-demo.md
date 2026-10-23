# Golden Web 真实整链联调计划

目标：沿用已批准的固定 Golden 七工序方案，从页面上传 STEP、真实 NX 解析、生成工艺、修订 rough_step=0.4、批准工艺，到 Mastercam 生成并查看待审核 NC。

架构：保留 Core 真实工作区和 src/api/core HTTP 适配层；仅 Core 连接 Windows。具名 Golden 模板身份集中定义，零件尺寸由服务端解析报告生成，不在浏览器伪造几何。CAM 刷新先读取状态，对进行中运行调用 observe，再读取候选及原始文件。失败显示后端原因，不切换 Mock。

- [x] 核对现有 Web / Core / Windows 基线与 idle 状态。
- [x] 先补契约回归：新版模板请求不夹带旧几何；进行中 CAM observe、终态只读。
- [x] 最小修复模板选择、CAM观察、真实状态展示。
- [x] 页面实际上传指定 STEP 并重新解析，核对报告准入；若新报告与冻结证据不一致，先核对差异，不能自动忽略摘要。
- [x] 页面修订/批准/生成/查看 NC，保存 run、版本、摘要和截图；NC制造审核保持 pending。
- [x] quality、现有 Playwright 两个桌面视口检查，更新验收说明、PR及 issue135。

范围：固定模板初步演示；不把工艺倒角要求标成 STEP 倒角，不自动批准 NC，不宣称任意输入或制造验收完成。

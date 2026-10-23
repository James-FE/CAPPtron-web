# 原型 Core 接线验证（2026-10-24）

本批基于 PR28 的 `32b681c`，依赖 PR27 的契约适配和 PR28 的配置、命令与恢复控制器。二者尚未合入时，本分支包含其提交。此次验证在 macOS、Playwright Chromium 156/v1248 上执行，不连接 Windows。部署配置、STEP 内容、解析、工艺、CAM 和 NC 响应均使用明确合成的测试数据；测试不会产生制造证据。

## 结果

- `npm run quality`：22 个测试文件、343 项通过；仓库检查、Lint、格式、类型和构建通过。构建保留主包大于 500 kB 提示，未将其视为运行失败。
- `npm run test:e2e:core`：1920×1080、1440×900 共 16 项通过。覆盖原三阶段主路径、离散参数修订及批准、当前 NC 完整读取、刷新仅查询、未知规划命令原身份重试、上传/解析失败、过期批准、配置缺失/篡改、NC 文件读取失败。
- `npm run test:e2e`：50 通过、4 失败。失败均在既有 `program-review.spec.ts` 的编辑/撤销与专注编辑两项，各两视口。另从未修改的 `32b681c` 导出独立快照，运行同文件得到 6 通过、相同 4 失败；不是本批新引入的失败，未删除或跳过这些测试。
- 本机 Chromium 启动需要沙箱外 MachPort 权限；运行时设置 `PLAYWRIGHT_BROWSERS_PATH` 指向本地安装位置，`CAPPTRON_E2E_NETWORK_COMPAT=1`。CI 保留默认运行方式，并新增独立原型测试步骤与报告附件。
- 未修改 CSS。保留原三阶段导航、文件栏、输入双栏、工序列表/详情、参数字段和 NC 编辑器/工具栏；真实入口不再跳转到独立 Core 技术工作区。
- 规格与代码复核发现并修复：替换 STEP 后旧任务误用、切换页面丢失已上传文件绑定、不可恢复旧任务阻止明确新建、后台恢复改变隐藏页面阶段。组件回归覆盖上述边界。

## 截图

截图仅展示合成接口返回值，不是 Golden 或真实 Mastercam 输出。

| 阶段 | 1920×1080 | 1440×900 |
| --- | --- | --- |
| 上传与输入 | [截图](core-prototype-evidence/input-1920x1080.png) | [截图](core-prototype-evidence/input-1440x900.png) |
| 工艺修订 | [截图](core-prototype-evidence/planning-1920x1080.png) | [截图](core-prototype-evidence/planning-1440x900.png) |
| NC 只读查看 | [截图](core-prototype-evidence/nc-1920x1080.png) | [截图](core-prototype-evidence/nc-1440x900.png) |

## 剩余实机闭环

按[配置与操作说明](CORE-PROTOTYPE-LIVE.md)部署真实 Core 地址、离线包配置 URL 及受控原字节摘要；在 Windows 已就绪的会话中，用 Golden STEP 手动走一次上传、真实解析、工艺修订/批准、CAM 与 NC 完整读取，核对任务/修订/运行/NC 身份。人工 NC 审核与制造验收仍待完成。本批 NC 修改、审核、下载未接线，按钮保留位置并禁用。

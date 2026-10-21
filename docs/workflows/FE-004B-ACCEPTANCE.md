# FE-004B｜数据底座大屏与 DataFoundationReader 接入

记录日期：2026-10-21。开发基线：`origin/develop/r06-ui` 的 `f744c798207279420667d21ea0a8ee16d706cc8d`。功能分支：`feat/fe-004b-data-foundation-dashboard`。本记录包含开发侧验证证据，最终视觉验收由维护者完成；不自动合并。

## 1. 完成范围与数据边界

数据底座作为独立全局视图接入现有 AppShell，保留一个品牌页眉、当前入口和“返回智能工艺工作台”。页面包含六项 KPI、七日新增趋势、知识构成、模型库、工业资源数据库概览、热点知识，以及六类资源的只读目录、名称搜索、分页、详情和关联 ID 跳转。

数据契约、Schema、生成器、统计函数、默认配置均未修改。使用维护者验收的 `foundation-turning-mock-v2`，seed `20261020`，基准日期 `2026-10-20`，时区 `Asia/Shanghai`。Reader 返回的快照版本为 `foundation-turning-mock-v2:20261020:2026-10-20`，Schema 为 `1.0`；没有根据系统当天日期刷新 Mock。

实际资源仍为 24 个零件、32 套方案、96 道工序、3 台机床、40 把刀具、72 条知识、6 条模型登记、240 条使用事件。数据资产总量为 171（72 + 99），不含模型、工序或事件；六项 KPI 依次为 **171、27、72、99、6、4**。这是演示基准日统计，不是实时统计。

知识构成直接使用 Reader 返回的数量和百分比：行业 25 / 34.72%，所内 28 / 38.89%，经验 19 / 26.39%。知识“所内”分类不意味着真实单位来源。全部模型当前为 `not_connected`。界面展示模型登记及支持任务，不声称已部署、真实可调用或已建设知识图谱。目录关联不代表制造可行性验证。

未修改 CAPPtron-core、Golden-B7 v2、案例索引或 CASE-FE-001 读取层；未新增业务 HTTP、数据库、模型调用、编辑删除或 CNC 决策能力。

## 2. Reader 接入与替换

唯一依赖组合入口为 `src/app/dataFoundation.ts`：模块级创建 `MockDataFoundationReader(foundationDemoConfig)`，并以 `DataFoundationReader` 类型导出。App 可注入另一个 Reader。页面和功能组件只依赖契约，不导入生成器、生成模板或使用事件。

- `getOverview()`：六项 KPI 和统计日。
- `getGrowthTrend({ days: 7 })`：实际日期及两条新增序列，保留零值。
- `getKnowledgeDistribution()`：互斥分类、数量、Reader 已分配的百分比。
- `getResourceSummary()`：模型类型、接入状态及四类业务资源数量；两个面板共享一次读取。
- `getHotAssets({ days: 7, limit: 5 })`：按返回排名显示知识标题与引用次数，展示实际窗口。
- `listAssets({ kind, keyword, page, pageSize: 10, sortBy: 'name', sortDirection: 'asc' })`：搜索提交后回到第一页；分页交给 Reader。
- `getAssetDetail(kind, id)`：六类详情、完整知识正文、登记时间、来源、版本和稳定 ID。关联按钮继续使用该方法读取目标。

`useFoundationQuery` 隔离每个请求的加载、成功、失败与重试状态。参数变化立即隐藏旧响应，清理标记阻止旧请求迟到覆盖结果。统计模块可独立失败；资源汇总失败影响两个共享面板。错误保留 Reader 类别，不补零、不回退其他数据源。空列表与不存在的详情有独立文案。

全页与资源目录/详情消费响应的 `schemaVersion`、`datasetVersion`、`dataMode`、`asOf` 和 `timeZone`。模拟模式使用“演示日新增”“演示日模拟模型调用”“模拟引用”，live 测试替身验证真实来源和模型状态不会被硬编码为 Mock。

未来真实 API：由新的 Reader 实现全部七项能力，在组合入口替换实例。后端需提供一致的快照语义、聚合口径、权限过滤后的总数/分页/详情、知识引用和模型调用审计事件，并将结构、版本及完整性失败映射为现有错误类别。页面只计算图形坐标和相对条长，不重复聚合数据。此 PR 不假设这些正式 API 已存在。

## 3. 工作区会话保持

`view: workflow | foundation` 与 `WorkflowStage: input | planning | review` 分别管理。切换全局视图不改动 stage 或 sourceVersion，不销毁 WorkflowWorkspace；模型来源变化仍沿用原来的 key 重置规则。

工作区隐藏时使用 `hidden` 与 `inert`，关闭 Agent 抽屉和审核确认框，隐藏 Agent 气泡，并退出专注编辑的临时覆盖状态。任务、工序、现场参数、程序文档与修订、CodeMirror 编辑历史、Agent 消息和未发送输入保留。确认弹窗返回后不会重新出现。

资源目录使用模态 dialog，内部列表/详情分别滚动；Tab/Shift+Tab 约束在可见控件内，Escape 关闭，关闭后焦点返回打开按钮。切换大屏不会把隐藏工作区控件留在键盘操作范围。

## 4. Figma 对照与截图

设计来源：[01_Data_Foundation / 166:333](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK?node-id=166-333)。实施前已通过 Figma MCP 获取设计上下文和截图。保留深色底、青绿/紫/蓝配色、六项指标、中部 11:7 双图、底部三栏、8px 面板圆角及标题层级。

趋势和环图使用 React SVG，坐标/弧段由 Reader 数据计算，不平滑或修改数值。趋势数据点支持鼠标与键盘读取。Figma 导出的实线/虚线图例（37×3）和琥珀状态点（8×8）保存在 `public/data-foundation/`，按原始尺寸使用，无临时远程素材地址。

必要调整：固定快照来源替代旧“实时更新”文案；模型区显示六类登记而非过期数量或知识图谱；热点扩展为五条真实模拟知识引用。为了容纳这两处内容，底部面板约 300px 高，KPI 区留白适度收紧。1920×1080 完整显示；1440×900 保留字号、缩小间距，页面约 1049px 高，允许纵向滚动。两种尺寸均检查无横向溢出、覆盖按钮或标题截断。

截图来自真实 Chromium（100% 缩放），全页截图包含滚动区域：

- [1920×1080 大屏](fe-004b-evidence/dashboard-1920x1080.png)
- [1440×900 当前视口](fe-004b-evidence/dashboard-1440x900-viewport.png)
- [1440×900 全页](fe-004b-evidence/dashboard-1440x900-full.png)
- [资源搜索与零件详情](fe-004b-evidence/part-detail-1920.png)
- [知识完整正文与关联查看](fe-004b-evidence/knowledge-detail-1440.png)
- [程序审核往返后的草稿与修订](fe-004b-evidence/review-roundtrip-1920.png)

已逐图检查颜色、布局比例、字体、条长、曲线、环图、留白与滚动。最终是否接受与设计的适配差异，仍由维护者进行视觉验收。

## 5. 自动化与诊断

- `npm run quality`：通过。仓库基线、ESLint、Prettier、TypeScript、16 个测试文件 / 261 条 Vitest，以及生产构建通过。
- `npm run validate:foundation`：124 条通过。
- `npm run validate:catalog`：正式案例文件验证通过。
- `npm run test:infra`：10 条通过。
- Chromium E2E：两个桌面尺寸共 52 项全部通过（单 worker，1.3 分钟），没有跳过测试。

新增组件测试使用独立手写小数据集及人工验算响应，覆盖六类资源、不同总量、零值、空数据、live 来源、模型状态、各接口错误重试、缺失详情、旧请求迟到和 Reader 替换。新增浏览器用例覆盖 KPI、来源、键盘数据点、搜索分页、详情、焦点恢复、工序与参数、Agent 消息/未发送输入，以及 NC 草稿、修订和撤销历史。另有组件测试验证隐藏工作区会关闭确认框且不丢失草稿。

本机 Windows 执行使用已有 `CAPPTRON_E2E_NETWORK_COMPAT=1` 和单 worker；未改 Playwright 配置、超时、重试或旧断言。首次全套运行 51 项通过，1 项在 `page.goto('/')` 阶段发生 `net::ERR_ADDRESS_IN_USE`，尚未进入产品逻辑；[原始诊断记录](fe-004b-evidence/windows-navigation-failure.txt)已保存。同样配置完整重跑 52 项全部通过，未重现该连接故障。Quality 中临时 Reader 测试因原有 5173 服务占用端口而自动选择另一端口，测试成功；未终止维护者的前端进程。

## 6. 已知边界与维护者验收

当前只提供桌面只读查询，1440×900 允许主体滚动；不增加 URL 路由、浏览器刷新后的任务持久化、数据录入或管理后台。资源关系可通过 ID 点击查阅，未引入跨实体批量联表或全局图谱。正式服务的认证、授权和一致快照保障仍属于未来 Reader/API 接入工作。

维护者可从顶部进入数据底座，查看固定快照标识，点击四类资源条、知识入口、模型入口或热点记录检查详情，再从程序审核往返确认原有工作内容保留。完成视觉验收后，由维护者决定是否合并。

# FE-002｜通用工艺决策工作台与 Agent 协作界面

状态：前端实现与本地自动化、Chromium 截图检查完成，提交独立功能分支供 PR 评审；未合并，维护者最终视觉验收待确认。本轮没有真实 Agent、CAM 或制造后端接入。

## 实现范围与组件

- 复用 `AppShell`、`WorkflowNavigation` 与 `FileInfoBar`；React 本地状态切换模型输入和工艺决策，不新增路由、状态库或其他依赖。
- `ProcessPlanningPage` 是唯一工艺决策页面。左侧按稳定 ID 渲染工序，右侧 `OperationDetails` 原位切换工步、参数资源、现场信息三个子视图。
- `ProcessPlan → ProcessOperation → ProcessStep / Parameter / ProductionResource` 为前端展示契约。序号与 ID 分离，参数包含值、单位、来源、完整性状态、编辑权限与输入类型。
- `src/api/mock/processPlans.ts` 的 `loadDemoPlan` 是显式 Mock 数据入口，每次首次加载返回独立对象；页面不通过文件名推断工艺，不请求后端。
- `ParameterFields` 统一渲染参数与可编辑现场字段。草稿按任务、工序、字段所属区域和字段 ID 隔离，不改写原始 Mock 值。
- `AgentBubble`、`AgentDrawer` 与消息类型位于 `src/features/agent`，可在后续工作页面复用；FE-003 和数据底座没有提前实现。

## 导航、输入来源与任务边界

“02 工艺决策”仅切换页面，初次进入显示“暂无可用工艺方案”。右上角“加载 Demo 方案”才加载演示工艺。模型输入页的 Ring_A 示例仍仅代表输入元数据，不自动加载工艺。

本地 File 保留在 `App` 使用的输入 Hook 中，页面往返不丢失。演示方案名称与本地文件栏分别展示，并注明未关联本地 STEP 文件。有效文件选择或重新选择输入示例会递增本地 `sourceVersion`，重建工作台及其所有会话；它不是后端修订号。取消选择、格式错误或多文件错误保留当前有效来源及方案。工艺页面更换文件失败也会显示错误。

同一模型来源会话内，各 Demo 任务分别保留选中工序、详情视图、现场草稿、对话及未发送输入。切换工序保留当前任务历史，历史消息记录发送时的工序 ID 和名称；切换任务展示对应任务记录。刷新页面会丢失这些临时数据，只有气泡坐标写入 localStorage。

## Demo 场景与制造语义

- 简单案例：演示支架，3 道工序，含无切削参数的成品检验。
- 复杂案例：演示壳体，20 道工序，2～8 个工步及长名称、多参数列表。
- 不完整案例：1 道毛坯检验工序，工步、装夹、资源和现场项缺失，尺寸值为空。
- 零工序案例：明确空状态，不补造工序。重排、删除后的稳定 ID 选择与合法回退另有单元测试。

所有方案与推荐值均为预设 Mock，未经机加工专家确认。没有参数的工序不被强制补入切削参数。现场输入仅检查可编辑性、空值和有限数值格式，不臆造公差范围，也不代表制造校核或人工实测确认。

现场视图固定提示：“本地演示草稿，未提交服务器，未完成制造校核。”程序生成按钮与第三阶段导航只提供准确的不可用反馈，不产生 NC，不进入未实现审核页。

## Agent 行为

- 仅工艺决策页面显示气泡；采用最新工作页面实例的 108×40 尺寸，默认右下角。
- Pointer Events 支持拖动与边界限制，超过 5px 视为拖动并阻止结束时误打开；窗口缩放重新约束坐标。
- localStorage 键为 `capptron.agent.position.v1`；损坏或不可用的存储回退默认位置。方向键移动 16px，Shift 加速至 48px，Home 恢复默认；Enter/Space 打开。
- 抽屉使用原生 `dialog.showModal()`，支持收起、Escape 与背景点击关闭；Tab/Shift+Tab 在抽屉内循环，关闭后恢复触发按钮焦点。
- 标题、任务/工序上下文、消息输入和发送区固定；历史独立滚动，关闭重开保留阅读位置。抽屉内的工序选择与主工作台同步。
- 可输入任意文本，但仅返回明确标记的固定 Demo 说明。没有推理、参数修改、重规划、工具调用、CAM 执行或服务器保存。未加载方案时可以打开查看说明，不能发送任务消息。

## 最新 Figma 对照

本轮通过恢复后的 Figma MCP 实际读取以下节点的最新设计上下文和截图，未写入 Figma 文件：

- [工艺决策 166:1210](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK?node-id=166-1210)
- [参数与资源 166:1261](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK?node-id=166-1261)
- [Agent 抽屉 171:284](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK?node-id=171-284)
- [AgentBubble 171:890](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK?node-id=171-890)
- [交互规范 179:317](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK?node-id=179-317)
- [现场信息 166:1358](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK?node-id=166-1358)
- [共享 Shell / 模型输入 166:1174](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK?node-id=166-1174)

保留深色面板、青绿色强调、26/20/17px 标题、13～14px 控件与正文、12px 辅助说明和既有字体回退。1920 下左列 312px，1440 下 260px；右侧弹性布局。标题与来源固定，工序列表、正文、推荐参数及 Agent 对话使用真实滚动容器。

有意适配：增加显式 Demo 加载入口和来源提示；资源、参数、现场信息合并为同一详情组件的子视图；详情切换控件放在标题右侧以保留正文空间；现场“确认”改为草稿编辑；Agent 抽屉宽度为 `min(720px, 48vw)`，小屏有回退规则。未采用原型的真实生成暗示或“现场条件已确认”跳转。无截图背景、无静态九工序逻辑、无新增静态图片资产。

## 验证记录与截图

本轮实际运行环境：Windows，Node.js 24.16.0，npm 12.0.2，真实 Playwright Chromium。最终结果：

- `npm run quality`：仓库检查、ESLint、Prettier、TypeScript、Vitest 28 项及生产构建通过。
- `npm run test:infra`：10 项通过。
- `npm run test:e2e`：1920×1080、1440×900 合计 28 项通过（FE-001 12 项、FE-002 16 项）。原“工艺决策不可用”断言随入口开放替换为导航和来源隔离测试，原文件选择、取消、格式校验及拖放覆盖保留。
- 实际检查两视口工作台与 Agent 截图，未见整页横向溢出、关键操作遮挡或抽屉输入区不可见；通过真实浏览器验证局部滚动、拖动恢复、焦点循环、Escape、历史与长对话滚动位置保留。

本地证据目录（不提交 Git）：`D:/GPT_workspace/CNC_project/FE-002-evidence/2026-10-17/`。其中 `1920x1080/` 与 `1440x900/` 各包含：

- `planning-empty.png`：未加载工艺方案。
- `planning-default-agent-bubble.png`：默认方案与气泡位置。
- `planning-selected-operation.png`：切换工序。
- `planning-long-list-parameters.png`：长工序与参数滚动。
- `planning-incomplete.png`：缺失工步与说明。
- `planning-onsite-draft.png`：现场本地草稿。
- `planning-agent-drawer.png`：Agent 上下文、历史和输入区。

目录下 `playwright-report/index.html` 是本地完整报告。PR 的 Quality 工作流会上传 `playwright-results` Artifact（截图、HTML 报告及失败诊断，保留 14 天）；具体运行及 Artifact 链接见 PR。截图检查是本轮工程验收证据，不是经维护者批准的视觉回归快照基准。

## 限制与后续接入

- 不持久化文件、草稿、工艺或对话；不提供深链接与浏览器前进后退路由。后续接入真实任务时需明确恢复、身份和版本契约。
- 本轮数据边界仅提供 Mock。真实状态需经 `src/api` 的适配器映射，并处理网络错误、版本冲突与过期响应，不能把本地 sourceVersion 当成业务版本。
- 未接入 STEP 上传/解析、真实 Agent、模板服务、参数校核、CAM、NC 生成/下载、程序审核、制造审批或归档。输入准备后端状态仍按 TODO-001 单独规划。
- 工艺卡批准、NC 人工审核、仿真通过及实机安全维持不同语义。
- 本次验收针对两个桌面视口和 Chromium；字体渲染与其他浏览器差异仍需部署环境复核。

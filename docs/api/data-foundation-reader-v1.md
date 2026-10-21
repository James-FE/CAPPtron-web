# 数据底座 Reader v1｜查询接口与真实数据接入指南

适用范围：FE-004A 数据契约、FE-004B 数据大屏。核对日期：2026-10-21。

**本文描述已经实现的前端 TypeScript 读取契约，不是已发布的 HTTP API。当前唯一正式实现为 MockDataFoundationReader；CAPPtron-core 的数据底座 URL、鉴权、快照协议与 HTTP 错误映射尚未约定。** 后续开发者或 Agent 应先确认后端实际能力，再实现新的 Reader。

## 1. 从哪里开始

- [Reader 接口与错误类型](../../src/api/data-foundation/reader.ts)：七个异步方法，是页面与数据源之间的边界。
- [完整类型](../../src/api/data-foundation/types.ts)：参数、返回对象、六类实体和枚举的权威定义。
- [查询校验](../../src/api/data-foundation/queries.ts)、[时间规则](../../src/api/data-foundation/time.ts)、[统计实现](../../src/api/data-foundation/statistics.ts)：默认值、边界及口径的可执行依据。
- [领域架构与 Schema](../architecture/data-foundation-v1.md)：资源字段、单位、关系、合成数据与制造可信度边界。
- [应用组合入口](../../src/app/dataFoundation.ts)：选择具体 Reader 的唯一应用位置。
- [页面](../../src/pages/data-foundation/DataFoundationPage.tsx)、[资源目录](../../src/features/data-foundation/FoundationAssetBrowser.tsx)、[详情](../../src/features/data-foundation/FoundationAssetDetail.tsx)：真实消费路径。
- [页面验收及截图](../workflows/FE-004B-ACCEPTANCE.md)：当前视觉、交互与测试证据。

源码类型与本文发生差异时，先检查版本和测试，不依靠文档自行补字段或修改数据。调整契约时同步类型、运行时校验、实现、测试和文档。

## 2. 接口总览

以下签名中的类型从 `src/api/data-foundation` 导入：

```ts
interface DataFoundationReader {
  getOverview(query?: OverviewQuery): Promise<FoundationResponse<FoundationOverview>>
  getGrowthTrend(query: TrendQuery): Promise<FoundationResponse<GrowthTrend>>
  getKnowledgeDistribution(): Promise<FoundationResponse<KnowledgeDistribution>>
  getResourceSummary(): Promise<FoundationResponse<ResourceSummary>>
  getHotAssets(query: HotAssetQuery): Promise<FoundationResponse<HotAsset[]>>
  listAssets(query: AssetQuery): Promise<FoundationResponse<AssetPage>>
  getAssetDetail(kind: AssetKind, id: string): Promise<FoundationResponse<AssetDetail | null>>
}
```

除 `getOverview()` 外，有查询参数的方法必须传对象；可使用 `{}` 采用默认值。全部返回 Promise，失败使用 rejection，不返回伪成功对象。v1 不包含写操作、模型调用、事件原文查询或 AbortSignal 参数。

当前大屏展示**五项** KPI：总资产、演示日新增、知识、业务数据、模型数量。维护者已要求移除模型调用卡片；Reader 的 `modelInvocationsToday` 仍是兼容契约的一部分，不因此删除事件或改变统计。

### 2.1 统一响应与来源

```ts
type FoundationResponse<T> = {
  data: T
  meta: {
    schemaVersion: '1.0'
    datasetVersion: string
    dataMode: 'synthetic_demo' | 'live'
    asOf: string
    timeZone: string
    window?: { startDate: string; endDate: string }
  }
}
```

- `schemaVersion` 是本契约版本，不是 CaseCatalog 版本、模型版本或数据版本。
- `datasetVersion` 标识读取的快照。当前为 `foundation-turning-mock-v2:20261020:2026-10-20`；真实实现应提供可用于一致性核查的快照标识。
- `dataMode` 表示真实或合成来源。只有数据实际来自正式数据源时才使用 `live`，不能只改标签。资源的 `provenance.dataMode` 与响应必须一致。
- `asOf` 为带时区的截止时间，不是浏览器显示时钟。查询过去日期不改变快照截止点。
- `timeZone` 是实际采用的业务时区，默认来自快照；日期查询允许覆盖。使用 UTC 或可识别的 IANA 名称，例如 `Asia/Shanghai`，不接受 `+08:00` 形式的时区名称。
- `window` 仅出现在概览、趋势、热点响应中；概览的开始/结束日相同。目录、详情、分布和汇总不带窗口。

当前 Mock 基准日期固定为 `2026-10-20`，不随电脑时间滚动；同一 Reader 实例首次成功读取后保持快照稳定。未来后端也须保证同一页面的一组查询和后续分页使用一致的快照及权限范围。

### 2.2 日期及通用输入规则

业务日期格式为 `YYYY-MM-DD`，支持有效日历日期且不早于 `1900-01-01`；资源/事件时间戳必须带 `Z` 或明确偏移。统计先把时间戳转换到查询时区，再按自然日归组。

窗口包含首尾日期，等价于当地首日 00:00 到结束日次日 00:00 的左闭右开区间，并受 `asOf` 截止点约束。夏令时的自然日可能是 23 或 25 小时。结束日不能晚于快照在查询时区下的日期；开始日早于数据登记日是合法情况，以零值表示。当前日未结束时不能虚构未来部分的记录。

未知字段、非法枚举、`null`、数字字符串、非有限数、越界或非整数的分页/窗口参数均拒绝，不静默转换。可选参数省略即可。资源可选字段缺失时省略，关系为空用 `[]`，不可用 `null` 代替；详情方法的 `data: null` 是明确例外。

## 3. 七项查询详细约定

### 3.1 getOverview — 快照概览

输入 `OverviewQuery = { date?: string; timeZone?: string }`。默认日期是 `asOf` 在所选时区下的日期；默认时区为快照时区。

返回 `FoundationOverview` 的字段均为必需字段：

- `date: string`：本次新增/调用计数使用的业务日期。
- `totalAssets: number`：Knowledge + Part + ProcessPlan + Machine + Tool。
- `addedToday: number`：上述五类记录在 `date` 登记的数量；不含 Model。
- `knowledgeCount: number`：Knowledge 总数。
- `businessDataCount: number`：Part + ProcessPlan + Machine + Tool 总数。
- `modelCount: number`：Model 登记总数，单独计量。
- `modelInvocationsToday: number`：`date` 当天 `model_invoked` 事件条数，当前大屏不显示。

总量均代表 `asOf` 的目录，`date` 只改变当天计数，**不是历史存量查询**。所有计数为非负整数，资源为空时返回真实的零值。恒等式：`totalAssets = knowledgeCount + businessDataCount`。工序、工步、关系和事件不作为顶层资源再计数。

页面调用：`reader.getOverview()`。指定计数日示例：`reader.getOverview({ date: '2026-10-19', timeZone: 'Asia/Shanghai' })`。

### 3.2 getGrowthTrend — 每日新增

输入 `TrendQuery = { days?: number; endDate?: string; timeZone?: string }`：`days` 默认 7，范围 1–366；`endDate` 默认快照业务日期。开始日由结束日向前取 `days - 1` 个日历日得到，窗口不能超出支持日期范围。

```ts
type GrowthTrend = {
  startDate: string
  endDate: string
  points: { date: string; knowledgeAdded: number; businessDataAdded: number }[]
}
```

`points` 按日期升序且长度为 `days`，无记录的日期也保留，两个数值为 0。知识与业务资源分别使用 `createdAt` 统计，不含模型登记或使用事件。`data` 与 `meta.window` 的边界一致。

页面调用：`reader.getGrowthTrend({ days: 7 })`。前端仅将点映射为 SVG 坐标，不重新生成趋势数据。

### 3.3 getKnowledgeDistribution — 知识主分类

无参数，按整个快照统计：

```ts
type KnowledgeDistribution = {
  total: number
  categories: {
    category: 'industry' | 'institute' | 'experience'
    count: number
    percentage: number
  }[]
}
```

始终保留三个分类，顺序为行业、所内、经验；空分类返回 0。每条知识仅计入一个主分类，`sum(count) = total`。知识分类不等于来源或真实性。

百分比单位是百分数（例如 `33.34` 表示 33.34%，不是 0.3334），精度 0.01 个百分点。后端应与当前规则一致：先取整数百分位，再按余数降序分配剩余量，平局按上述分类顺序。非空数据以整数百分位求和为 10000；完全空集百分比全为 0。页面直接显示该结果，不独立四舍五入。

### 3.4 getResourceSummary — 业务与模型汇总

无参数，返回：

```ts
type ResourceSummary = {
  businessDataCount: number
  businessResources: { kind: BusinessAssetKind; count: number }[]
  models: {
    total: number
    byType: { modelType: ModelType; count: number }[]
    byIntegrationStatus: { integrationStatus: IntegrationStatus; count: number }[]
  }
}
```

`BusinessAssetKind` 为 `part | process_plan | machine | tool`，按此顺序保留全部四类，计数之和等于 `businessDataCount`。模型分类也保留全部枚举及零值，顺序与 `types.ts` 枚举一致：

- `ModelType`：`general_llm`、`domain_model`、`feature_recognition`、`process_planning`、`parameter_recommendation`、`engineering_calculation`。
- `IntegrationStatus`：`not_connected`、`configured`、`available`、`unavailable`。

两个模型维度各自加总为 `models.total`，不能将两个维度再相加。模型类型、支持任务、服务接入状态分别表达；仅登记模型不代表可调用。当前六条合成模型均未接入。

页面只读取一次响应供模型和工业资源两个面板使用，条长按返回数量相对计算；具体模型名称、任务和版本从目录/详情读取。

### 3.5 getHotAssets — 窗口内热点知识

输入 `HotAssetQuery = TrendQuery & { limit?: number }`，时间默认值和边界同趋势；`limit` 默认 5，范围 1–100。

```ts
type HotAsset = {
  kind: 'knowledge'
  id: string
  title: string
  referenceCount: number
  rank: number
}
```

按窗口内 `knowledge_referenced` 事件聚合，返回 `HotAsset[]`；只包含至少被引用一次的知识。先按引用次数降序，平局按知识 ID 的 UTF-16 码元升序，连续排名从 1 开始。最多 `limit` 条，没有引用时返回 `[]`。`referenceCount` 必须可追溯至真实事件；模型调用不得算作知识引用。

页面调用：`reader.getHotAssets({ days: 7, limit: 5 })`，点击后以 `knowledge` 和返回的 `id` 获取详情。v1 没有刀具/工艺等其他类型的热点，方法名称不表示已支持任意资源热点。

### 3.6 listAssets — 分页资源目录

所有参数可省略，但必须传入查询对象：

- `kind?: AssetKind`：`part | process_plan | machine | tool | knowledge | model`；省略表示全部六类。
- `keyword?: string`：名称子串搜索，最长 200 字符，默认空字符串；知识以标题作为名称。查询做 NFKC、前后去空白、转小写，名称做 NFKC 和转小写后匹配；不搜索正文、ID 或特征。
- `sortBy?: 'name' | 'createdAt' | 'id'`：默认 `createdAt`。
- `sortDirection?: 'asc' | 'desc'`：默认 `desc`。
- `page?: number`：从 1 开始，默认 1，最大 1000000。
- `pageSize?: number`：默认 20，范围 1–100；**当前 UI 显式请求 10**。

```ts
type AssetPage = {
  items: {
    kind: AssetKind
    id: string
    name: string
    createdAt: string
    provenance: { dataMode: FoundationDataMode; source: string }
  }[]
  total: number
  page: number
  pageSize: number
}
```

`total` 是筛选后的总数，不是当前页长度。超过最后一页返回空 `items` 和真实 `total`，不是错误。没有匹配项时 `total = 0`。

`createdAt` 比较实际瞬间；`name`、`id` 按原字符串 UTF-16 码元排序，不使用宿主机 locale。主排序平局时始终按 `kind asc`、`id asc`，不随主排序降序反转。固定快照下分页稳定。真实数据库若使用不同排序规则，需要在服务或 Adapter 层明确对齐，不能让不同页出现重复/丢失。

页面调用示例：`reader.listAssets({ kind: 'part', keyword: '轴', page: 1, pageSize: 10, sortBy: 'name', sortDirection: 'asc' })`。省略 kind 的目录包含 Model，因此默认快照列表总量为 177，比资产 KPI 171 多 6，属于规定口径而非统计错误。

### 3.7 getAssetDetail — 完整只读实体

必需参数：`kind: AssetKind` 和 `id: string`。ID 必须匹配 `^[a-z0-9][a-z0-9._:-]{0,159}$`，不得把显示名称或数组下标作为 ID。

返回 `FoundationResponse<AssetDetail | null>`，其中 `AssetDetail` 为可辨识联合：

```ts
type AssetDetail =
  | { kind: 'part'; asset: Part }
  | { kind: 'process_plan'; asset: ProcessPlan }
  | { kind: 'machine'; asset: Machine }
  | { kind: 'tool'; asset: Tool }
  | { kind: 'knowledge'; asset: Knowledge }
  | { kind: 'model'; asset: Model }
```

`asset` 必须保留领域对象的核心字段、完整知识正文及嵌套关联，不使用列表摘要冒充详情。六类实体的字段和单位以 [types.ts](../../src/api/data-foundation/types.ts) 与[领域契约](../architecture/data-foundation-v1.md#六类资源)为准。每条都有 `id`、`createdAt`、`provenance`；工艺方案引用 `partId`，工序引用机床/刀具/知识 ID，知识关联使用 `{ kind, id }`。

合法但不存在的身份返回 `data: null`；不合法的身份参数拒绝为 `invalid_query`。v1 不提供历史业务版本查询，同类同一 ID 对应当前快照的一条记录。调用示例见已有[可执行示例](../../src/api/data-foundation/example.ts)，它从列表选择实际 ID 后读取详情，无需知道任何 Mock ID。

## 4. 错误、空态与请求生命周期

失败抛出 `FoundationError`，字段为 `code`、`message`、`issues: { path: string; message: string }[]`：

- `invalid_query`：参数不符合约定，应修正参数。
- `read_failed`：读取、连接或底层服务失败，可显式重试。
- `contract_incompatible`：响应 Schema 版本不受支持，需要协商/升级。
- `invalid_data`：字段、类型、枚举、日期、单位、额外字段或 JSON 结构无效。
- `data_integrity`：重复 ID、悬空引用、来源/时间冲突或声明关系不一致。

`issues.path` 应能定位相应字段或资源。Adapter 应重新构造 `FoundationError`，不能把服务器 JSON 错误对象直接当成 Error 抛出并期望 UI 识别 `instanceof`。

正常空数据返回正常 meta 与空集合/零计数；资源不存在用详情 null。读取失败、权限拒绝和契约不兼容不能伪装成这些正常空态。未来 HTTP 状态码如何映射仍需后端协商；当前无专用认证/权限/快照过期错误码，如需要新增，应先版本化扩展错误契约和界面测试。未扩展前必须明确失败，不能吞掉错误或回退 Mock。

页面按模块独立加载和重试，旧请求迟到不会覆盖新查询；重试不是切换数据源。UI 当前没有自动轮询或取消传输协议。未来 Reader 可在内部管理连接与超时；若要加入 AbortSignal，应单独协调接口扩展，不能偷偷往严格校验的查询对象塞 `signal`。

## 5. 真实数据接入步骤（供维护者与 Agent）

### 5.1 接入前先确认事实

1. 阅读本文件、领域契约、页面验收记录与仓库 AGENTS.md；核对正在开发的分支和工作区状态。
2. 查明 CAPPtron-core 实际发布的 OpenAPI/服务能力。本文没有任何可直接请求的数据底座 URL；不能由方法名推测端点。
3. 确认正式数据源可提供六类目录、稳定 ID、版本、登记时间、来源和明确单位。知识正文、关联资源、材料信息与模型状态均可能受权限限制。
4. 约定统计/目录/详情的统一权限范围、快照身份与截止时间，明确删除/归档、迟到事件、调用失败/重试去重的业务口径。现有 v1 没有删除事件、历史存量或关系建立时间。
5. 约定知识引用与模型调用的独立审计来源。没有真实事件时，不得用模型登记数推导调用量，也不能把 Mock 热点搬入 live 响应。

### 5.2 实现新的 Reader

在 `src/api/data-foundation/` 下增加适配实现，`implements DataFoundationReader`。名称和传输模块按届时实际接口决定。业务 HTTP、参数序列化、后端 DTO 映射、运行时校验、认证与错误映射留在数据层，React 页面不读取原始数据库表或 HTTP JSON。

重要约束：

- 不把真实数据交给 `MockDataFoundationReader` 的测试 loader；该实现明确拒绝 live 数据。
- 不把所有资源无条件拉到每个组件重新聚合。总量、趋势、分布和热点适合由后端一致统计；列表必须支持服务端分页。
- 现有 JSON Schema 和 `validateFoundationDataset` 校验的是**完整 FoundationDataset**，不是七种查询响应的通用验证器。HTTP DTO 与 `FoundationResponse<T>` 的运行时验证尚需在新 Adapter 中实现并测试，不可通过类型断言跳过。若真实接口返回完整快照，可复用现有完整数据集校验；分页响应不能假造缺失资源来通过它。
- 数据错误不通过补造资源、替换未知枚举或删除非法字段来掩盖。规范化后端格式时应有明确映射规则与测试。
- 同一 Reader 的首次并发请求应共享一致快照约定；当前接口不接受客户端传入 snapshot token，真实 Adapter 需内部管理，或先提议契约扩展。快照过期应明确失败，不将新快照混入旧分页。
- 浏览器公开的 `VITE_` 配置只能存非秘密配置。模型凭据、数据库凭据和制造控制端信息不能放进前端。

### 5.3 替换组合入口

当前 `src/app/dataFoundation.ts` 在模块级构造固定 Mock Reader，页面切换和 React 重渲染不会重建数据。默认 seed、日期和车削快照已经人工验收，不能在接入工作中悄悄改为系统今天。

正式 Reader 完成后，在该组合入口显式选择新实例，并保持实例稳定；数据源切换策略需要由维护者确定，当前没有自动环境选择或 `.env` live 开关。也可利用 App 已有注入点进行集成测试：

```tsx
// 类型与导入路径按工程根目录下的调用文件调整；reader 由调用方创建。
import App from './src/app/App'
import type { DataFoundationReader } from './src/api/data-foundation'

export function IntegratedApp({ reader }: { reader: DataFoundationReader }) {
  return <App foundationReader={reader} />
}
```

页面的 `DataFoundationPage({ reader })`、图表和目录消费相同接口；一般不需要修改 UI 业务逻辑。后端尚未提供的能力应明确失败或保留为未接入范围，不可混合返回一部分 live、一部分 synthetic_demo 并统一标为真实。

### 5.4 接入验收清单

- [ ] 编译期实现全部七个方法；真实响应经过运行时版本、结构、有限数值、日期和必要完整性校验。
- [ ] 概览、分类与目录总数符合权限过滤后的同一快照；Model 单独计量。
- [ ] 趋势连续补零，时区午夜和夏令时行为正确；热点排序、平局和 Top N 可追溯。
- [ ] 搜索规范化、稳定排序、第一页/末页/越界页及六类详情正确；未知身份和读取失败明确区分。
- [ ] 未接入模型不显示为可用；知识分类与来源不混用；实体来源和响应 meta 一致。
- [ ] 超时、鉴权/权限失败、错误版本、非法数据、快照过期不会回退 Mock 或显示假零值。
- [ ] 快速搜索、资源切换和迟到请求不能污染新结果；显示的来源、时间和快照能够核实。
- [ ] 工作台/大屏往返保持工序、参数、NC 修订与编辑历史、Agent 消息；两个桌面尺寸完成视觉检查。

可复用的测试位置：[数据契约测试](../../src/api/data-foundation/tests)、[独立测试 Reader](../../src/test/foundationReader.ts)、[页面接入测试](../../src/pages/data-foundation/DataFoundationPage.test.tsx)、[大屏 E2E](../../e2e/data-foundation.spec.ts)、[程序审核往返 E2E](../../e2e/program-review.spec.ts)。测试替身用于展示可替换性，不能充当正式 HTTP 实现的参数/错误规范验证器。

```bash
npm run example:foundation
npm run validate:foundation
npm run validate:catalog
npm run test:infra
npm run quality
npm run test:e2e
```

新增 Adapter 还需针对实际 HTTP 协议、权限、错误和快照增加契约测试/集成测试；现有 Mock 测试通过不表示真实服务已联通。最终 PR 应提供服务版本、实际数据来源、测试与截图证据，不暴露秘密或私有制造资产。

## 6. 明确不在本接口内的能力

目录不提供 CRUD、模型执行、NC 生成、机床控制、实时订阅、知识图谱或制造安全认证。CaseCatalogReader 仍独立管理工程参考案例。以后若要将标准案例纳入资源目录，应另外约定身份、版本、来源和去重 Adapter，不能修改 Golden-B7 内容或直接重复计数。

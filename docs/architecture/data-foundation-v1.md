# FE-004A｜数据底座契约 v1

## 定位与实现边界

本层位于 `src/api/data-foundation/`，面向跨零件、工艺、机床、刀具、知识和模型的资源目录与统计查询。领域契约不引用 React、图表组件、Figma、FE-002 ViewModel 或 CASE-FE-001。

数据路径为：领域契约 → 可复现 Mock 快照 → Ajv 结构校验与关系校验 → 纯统计函数 → `DataFoundationReader`。FE-004A 交付数据层；FE-004B 已接入大屏，见[页面验收](../workflows/FE-004B-ACCEPTANCE.md)和[查询接口与真实接入指南](../api/data-foundation-reader-v1.md)。目前没有正式数据库、真实 HTTP Reader 或模型 API。模拟数据不得用于 NC 生成或真实加工配置。

`CaseCatalogReader` 仍负责经过版本化登记的工程参考案例、NC 资产引用与验证证据。Golden-B7 v2、摘要及案例索引保持原样，新资源不会进入案例目录或 FE-002 方案选择器。两处都使用 `schemaVersion` 字段并不意味着共享契约；本层 Schema 的标识为 `urn:capptron:data-foundation:dataset:1.0`。

## 契约文件与类型

- `types.ts`：六类领域实体、使用事件、快照与查询返回类型。
- `schema/foundation-dataset.schema.json`：独立 Draft-07 JSON Schema。
- `compatibility.ts`：声明式分类允许的加工方式，不是实际制造能力认证。
- `validation.ts`：JSON 可表示性、Ajv 与跨资源一致性校验。
- `time.ts`、`queries.ts`：日期语义和严格查询校验。
- `statistics.ts`：不修改输入、不读取时钟的纯统计函数。
- `reader.ts`：七个异步方法及分类错误。
- `mock/`：生成配置、生成器和 Mock Reader。
- `index.ts`：供组合入口使用的 Reader、公共类型和错误；不导出生成算法。
- `example.ts`：只依赖 Reader 的消费示例。

### 共享字段与身份

每条资源具有 `id`、`createdAt`、`provenance`。ID 是不透明字符串，同类内唯一，允许字符为小写字母、数字、点、下划线、冒号、连字符，最长 160 字符。身份不来自数组位置；跨类型使用 `{ kind, id }` 引用。工序 ID 在所属方案内唯一，序号另存为正整数且在方案内唯一。

`createdAt` 是目录登记时间，不是零件加工时间、模型部署时间或知识真实性证明。时间戳必须带 `Z` 或明确偏移，支持秒和最多三位小数；拒绝无时区、无效日历日期、闰秒与表示未知偏移的 `-00:00`。业务日期使用 `YYYY-MM-DD`，支持从 1900 年开始的日期。

`provenance` 含 `dataMode: synthetic_demo | live` 和非空的 `source` 来源描述。一个快照内资源、事件的模式必须与根级 `dataMode` 一致。当前生成器全部为 `synthetic_demo`，来源是 `foundation-turning-mock-v2`。`live` 是未来来源能力，不表示本阶段已经实现真实接入。

可选标量缺失时省略字段，不使用 `null` 或显式 `undefined`；无关系使用空数组。所有对象拒绝额外字段，不自动转换枚举、数字或补默认数据。数值必须有限，尺寸、转速必须为正。JSON 可表示性检查拒绝循环对象、非普通对象、稀疏数组中的缺失项等；Schema 再检查字段结构。

### 六类资源

以下为通用契约的可表达范围。当前 Mock 业务范围已收敛为回转体车削，具体生成范围见后文；保留通用枚举以兼容读取契约，不表示当前生成器仍提供铣削等场景。

1. **Part**：`name`、`category`、`material`、`features`、`description`。分类为轴、环、盘、板、壳体；材料与典型特征用非空文本描述，不代表 CAD 解析结果。
2. **ProcessPlan**：`name`、`partId`、`version`、`manufacturingType`、`operations`。加工分类为车削、铣削、钻削、车铣复合或混合；每个方案指向一个零件，一个零件可对应多个方案。工序具有 `id`、`sequence`、`name`、`method`、可选 `machineId`、`toolIds`、`knowledgeIds`。加工方式包含车削、铣削、钻削、镗削和切断。允许零工序、机床缺失、空刀具/知识引用。
3. **Machine**：`name`、`machineType`、可选 `manufacturer`、`capabilities`、`supportedOperations`。机床类型涵盖数控车床、立式加工中心、数控铣床、钻削设备、车铣复合设备。能力字段可缺失，包括 `axisCount`、`maxSpindleSpeed: { value, unit: 'r/min' }`、`workEnvelope: { x, y, z, unit: 'mm' }`。
4. **Tool**：`name`、`toolType`、`specification`、`supportedOperations`、`compatibleMachineTypes`。类型涵盖外圆车刀、内孔车刀、切断刀、立铣刀、钻头和镗刀。规格有说明，可选 `diameter: { value, unit: 'mm' }`、`cuttingEdgeCount`。当前车削生成器仅给钻头填直径，其他刀具的名义刀杆规格放在说明中，不把刀杆尺寸误作切削直径；不生成立铣刀。所有规格均未经实物和加工适配确认。
5. **Knowledge**：`title`、`content`、`topic`、`knowledgeCategory`、`applicability`、`relatedAssets`。主题包括工序规则、材料、刀具选择、装夹、参数条件、质量；主分类为 `industry`、`institute`、`experience`，分别对应行业、所内、经验知识。主分类是单值，与来源严格分开，模拟“所内知识”仍是合成数据。适用条件的 `operations`、`partCategories`、`materials` 数组为空表示没有声明限制，不表示已经验证适用于所有场景。关联资源是类型化引用，可覆盖六类资源。
6. **Model**：`name`、`modelType`、`supportedTasks`、`integrationStatus`、可选业务 `version`。类型包括通用语言模型、领域模型、特征识别、工艺规划、参数推荐和专业计算；支持任务另行登记。接入状态为 `not_connected | configured | available | unavailable`，与模型类型分离。合成模型只允许 `not_connected`；其模拟调用事件不代表真实请求、权重、凭据或部署。

### 关系和时间验证

校验资源、工序及事件的作用域 ID 唯一性，所有 Part → Plan、Operation → Machine/Tool/Knowledge、Knowledge → 相关资源、Event → Knowledge/Model 引用必须存在。重复的引用数组项直接拒绝，不以关联数量增加资产总量。

工序加工方式必须属于方案分类；关联机床与刀具需声明支持该加工方式，存在机床时刀具还需声明兼容其类型。知识若声明适用条件，必须与工序方式、零件类别、材料相符。模型事件若携带 `task`，目标模型需声明支持。

资源登记不得晚于快照，方案不得早于所属零件登记，事件不得早于目标资源登记或晚于快照。引用描述当前快照的关系，不声称关系在资源最初登记时已存在；尤其知识可在当前快照关联后来登记的方案。本层不保存关系建立时间或修改历史。生成器另外将方案登记时间放在其直接使用资源登记之后。

这些校验只证明目录内部声明一致，不证明刀具装配、机床运动学、CAM、工艺可制造性或实机安全。不对实际尺寸、材料适配或工艺参数作生产承诺。

## Schema、数据版本和快照

- `schemaVersion: '1.0'`：本层结构版本。未知版本抛出 `contract_incompatible`；不重用案例库版本含义。
- `datasetVersion`：标识一次数据快照；当前 Mock 为 `foundation-turning-mock-v2:<seed>:<asOfDate>`。生成规则改变时升级此前缀，Schema 仍为 `1.0`；旧 `foundation-mock-v1` 导出属于历史多工艺快照，不能与新版混作同一批数据。
- 实体 `id`：稳定目录身份。当前快照每个 ID 只有一条记录。
- 方案/模型的 `version`：实体业务版本，不是 Schema 或随机种子。将来若读取历史版本，必须另行明确身份与版本的唯一约束。
- `asOf`：该快照的数据截止时间，所有返回共享，不会随着查询时刻变化。
- `timeZone`：默认业务时区，Mock 为 `Asia/Shanghai`；查询可覆盖，响应保留实际采用的时区。

JSON Schema 与 TypeScript 同时维护：契约测试在编译期检查领域对象字段集合，在运行期检查全部枚举、合法样本与非法字段、单位、日期、额外属性及关系。Ajv 未启用类型转换、默认值注入或字段删除。Schema 的自定义 `foundation-timestamp`、`foundation-timezone` 格式由 `validation.ts` 注册，外部验证器也必须实现这些格式，不能忽略它们。

## Mock 的唯一事实来源

调用 `generateFoundationMock({ seed, asOfDate })` 构建内存数据；不维护第二份静态 JSON。默认可复现配置为 seed `20261020`、日期 `2026-10-20`。seed 为 uint32，生成日期不早于 `1901-01-01`，为历史分布预留空间。

规模为 Part 24、ProcessPlan 32、Machine 3、Tool 40、Knowledge 72、Model 6，事件 240，其中知识引用 180、模型调用 60。业务资源共 99，知识与业务资源合计 171；加上单独计量的模型，资源列表共有 177 条。工序共 96 条，不计入顶层资源数。

当前只生成轴类、环套类、回转盘类，各 8 个零件。所有方案的 `manufacturingType` 为 `turning`。工序覆盖外圆与端面车削、车床轴向钻孔、车床内孔镗削、车床切断；其中 `drilling`、`boring`、`parting` 是车削方案内的加工方式，不是独立的钻削、铣削或车铣复合方案。盘类只描述回转体阶段，法兰盘等使用毛坯名称，不包含孔阵列、键槽或其他后续非车削特征。

全部机床为两轴 `cnc_lathe`；刀具为外圆车刀、内孔车刀、切断刀、车床轴向钻头、车床镗刀，五类各 8 个名义规格，声明兼容类型仅为数控车床。知识由三类零件、六种主题和四种材料组合，标题、正文及适用条件均限定车削语境。工序通过引用复用机床、刀具和知识。八个备选方案的首道工序省略机床和刀具，用于缺失状态。独立测试事实集还覆盖零工序、无方案零件、无引用知识和完全空集。

生成过程先按人工编写的模板确定零件名称、类别、典型特征、工序顺序、知识正文和候选资源种类，再以种子产生的伪随机序列选择材料、兼容资源、知识主分类、登记时间和使用事件。种子不会推导制造知识、几何特征或工艺规则；知识正文是主题说明与材料注意事项的组合，不是模型实时生成。热点通过事件聚合产生，事件采样有意偏向部分知识，不代表实际使用偏好。

伪随机状态属于函数内部，不调用 `Math.random()` 或系统时钟。ID 根据 seed、资源类型和语义键计算，不随基准日变化；不按数组显示位置索引资源。**可复现需要相同生成器版本、seed 和基准日期**；仅相同 seed 不保证跨生成器版本得到旧数据。新版保留相同语义键时可能沿用 ID，但材料、关联或时间可能变化，不能据此视为旧快照未变。所有生成时间位于基准日前的一段分布内，事件发生在目标登记之后。基准日的上海时间 `23:59:59.999` 是合成快照截止点，不冒充当前真实时刻。

生成器支持显式注入业务日期，但 **FE-004B 当前必须保留维护者验收的 2026-10-20 快照，不得自动取系统今天**。若将来明确更换演示快照，应更新配置与验收证据并创建新的 Reader，不能在每个查询中重新生成。Reader 首次读取时生成并验证快照，并发读取共享一次加载。成功后复制保存，外部修改配置、原始数据或返回值不能改变快照；失败不建立快照，下一次显式调用可重试。

## 统计规则

所有统计函数先验证输入，非法数据不会变成正常零值。登记时间是新增量的唯一事实来源，没有额外资产新增事件。

- **数据资产总量**：`Knowledge + Part + ProcessPlan + Machine + Tool`。
- **知识条目**：Knowledge 记录数。
- **业务数据量**：Part、ProcessPlan、Machine、Tool 记录数之和。
- **模型数量**：Model 登记记录数，单独计量。
- **今日新增**：指定业务日期登记的知识与四类业务资源之和，不包含模型。
- **今日模型调用**：指定业务日期内 `model_invoked` 事件数；与知识引用分开，当前全为模拟事件。
- **新增趋势**：默认最近七个自然日，含截止日；知识、业务资源分别按 `createdAt` 统计，日期升序，缺失日补零。支持 1–366 日窗口。
- **知识构成**：每条知识只在一个主分类计数；三分类数量之和等于知识总数。百分比先按万分比取整，再按余数从大到小分配剩余单位；平局按 industry、institute、experience 顺序。显示精度为 0.01 个百分点，非空集以整数百分位相加为 10000，空集全部为 0。
- **业务资源构成**：四类计数之和等于业务数据量。
- **模型汇总**：按模型类型和接入状态分别分组，每个维度的和等于模型总数，两组不能再加在一起计数。
- **热点知识**：窗口内 `knowledge_referenced` 事件按知识 ID 分组，次数降序，平局按 ID 的 UTF-16 码元升序；连续名次从 1 开始，只返回至少有一次引用的知识。每个结果含知识 ID、标题、引用次数和名次，可据窗口、ID 回查源事件；不生成额外随机热度。

所有资产总量、分布、列表均描述快照 `asOf` 时的目录。`getOverview({ date })` 只改变“今日新增/调用”的统计日，**不把总量变成历史存量**。v1 没有删除事件、存量历史或时间旅行查询。工序、知识关联、事件不会再次计为顶层资源。

### 自然日边界

时间戳先转换到查询的 IANA 时区，再按当地日期归组。窗口含开始日与结束日，等价于当地开始日 00:00 至结束日次日 00:00 的左闭右开区间，且数据不超过快照截止点。窗口不能结束在快照当地日期之后；早于数据起点的日期可返回零值。

日期标签的前后移动使用日历日期，**不将本地日固定解释为 24 小时**。测试覆盖上海 UTC+8 午夜，以及纽约夏令时开始和结束的 23/25 小时自然日。`meta.asOf` 始终是同一瞬间，`meta.timeZone` 是查询实际采用的时区；截止日可以是未结束的自然日，真实 Reader 需如实保留截止点。

## 统一读取契约

全部方法异步返回 `FoundationResponse<T>`：

```ts
{
  data: T,
  meta: {
    schemaVersion: '1.0',
    datasetVersion: string,
    dataMode: 'synthetic_demo' | 'live',
    asOf: string,
    timeZone: string,
    window?: { startDate: string, endDate: string }
  }
}
```

`meta.window` 用于概览的计数日、趋势和热点；分布、资源汇总、目录和详情不带时间窗口。

七个方法：

1. `getOverview({ date?, timeZone? } = {})` → `FoundationOverview`，六项指标及实际计数日期。
2. `getGrowthTrend({ days?, endDate?, timeZone? })` → `GrowthTrend`，窗口边界和连续每日点。
3. `getKnowledgeDistribution()` → 三个主分类的数量与百分比，空分类保留。
4. `getResourceSummary()` → 四类业务资源计数、模型总数、模型类型和接入状态两组计数，空分类保留。
5. `getHotAssets({ days?, endDate?, timeZone?, limit? })` → `HotAsset[]`。默认七天、Top 5；limit 范围 1–100，目前仅知识热点。
6. `listAssets({ kind?, keyword?, sortBy?, sortDirection?, page?, pageSize? })` → `AssetPage`，支持六类资源，`items` 仅含类型、ID、显示名称、登记时间和来源；知识用标题作为名称。`total` 是筛选后总数。名称搜索先做 NFKC、去除查询前后空格、转小写再子串匹配，最多 200 字符。
7. `getAssetDetail(kind, id)` → `{ kind, asset } | null`，类型可辨识的完整实体，合法但不存在的身份返回 null。

分页从 1 开始，默认 page 1、pageSize 20；page 上限 1000000，pageSize 范围 1–100。越界页面返回空数组及真实 total。默认 `createdAt desc`，可选 `name`、`id` 及升降序。时间排序使用实际瞬间；所有主值平局均按 kind、id 升序，不受宿主机语言设置影响。在固定快照下顺序与分页确定。未来真实源分页应在同一 datasetVersion 上读取，若快照过期必须显式报错，不能混合多个时刻的分页。

非法参数包括未知枚举、额外字段、null、非有限数值、非整数分页/天数、越界值、无效日期/时区和未来窗口，均拒绝，不隐式转换。没有网络请求或长任务，因此本轮没有引入 AbortSignal；未来 HTTP 实现可另行扩展轻量请求选项，而不把传输细节放进实体。

### 错误边界

通过 Promise rejection 返回 `FoundationError`，包含 `code`、`message`、`issues: { path, message }[]`：

- `invalid_query`：查询或生成配置无效；调用方修正参数。
- `read_failed`：底层读取异常；可显式重试，保留错误状态。
- `contract_incompatible`：未知 Schema 版本；需升级 Reader 或协商契约。
- `invalid_data`：字段结构、值类型、格式、单位、额外字段或 JSON 可表示性错误。
- `data_integrity`：重复身份、悬空引用、声明冲突、时间或来源不一致。

空数据、没有搜索结果、资源不存在不属于读取失败。失败不得悄悄替换为零统计或另一个数据源。Mock Reader 也拒绝将 live 数据包装成模拟实现。未来 HTTP 失败不得自动回退 Mock 并继续显示为实时数据。

## FE-004B 接入

已实现的组合入口为 `src/app/dataFoundation.ts`，显式选择稳定数据源；展示组件仅接收 `DataFoundationReader`。以下是组合入口构造与消费示意，不应复制到 React 页面内创建实例：

```ts
import {
  MockDataFoundationReader,
  type DataFoundationReader,
} from '../../api/data-foundation'
import { readFoundationExample } from '../../api/data-foundation/example'

const dataFoundationReader: DataFoundationReader = new MockDataFoundationReader({
  seed: 20261020,
  asOfDate: '2026-10-20', // 保留经过人工验收的固定快照
})

const results = await readFoundationExample(dataFoundationReader)
// results 含 overview、trend、knowledge、summary、hotAssets、page 和 detail。
// 每项保留 meta；展示层应据 dataMode 显示模拟来源及 asOf 截止时间。
```

`example.ts` 包含七种调用，`npm run example:foundation` 在 Vitest 中实际执行该 TypeScript 示例，分别注入生成数据 Reader 和手写小型事实集 Reader，并比较人工验算结果。`npm run validate:foundation` 校验完整数据契约、生成器、统计、Reader 和可替换性；全量测试与 CI 同样覆盖这些用例。

FE-004B 已按结果组织顶部 KPI、趋势、知识构成、模型分类、工业资源概览、热点、分页列表和详情；不导入 Mock 生成器、数据集或事件数组，不在每个组件重复聚合。按维护者最新意见，顶部只显示五项 KPI，不显示模型调用次数；`FoundationOverview` 的六项统计字段仍保持兼容。模型的完整列表通过 `listAssets({ kind: 'model' })` 和详情方法获取。错误、重试、空状态及模拟来源标识由展示层消费契约实现。完整方法参数、返回结构与正式接入步骤见[接口指南](../api/data-foundation-reader-v1.md)。

## 未来真实数据接入

本轮没有定义 URL、HTTP 状态映射或声称 CAPPtron-core 已提供接口。未来后端需按七种查询能力协商接口：总量/当日计数、日期趋势、知识构成、业务与模型分类、知识引用排行、分页目录和单条详情。聚合适合由后端在同一快照或一致的截止点执行，返回相同来源、版本、时区和窗口含义。

正式工业资源数据库应提供稳定身份、业务版本、登记时间、单位明确的能力与规格、知识分类及来源、模型能力登记和实际接入状态。新增趋势可以继续依据登记时间；热点与调用次数需要独立、去重的知识引用审计和模型调用事件，模型登记本身不证明发生过调用。当前所有实体和事件都只能由 Mock 提供。

接入前需约定：

- ID 命名空间与业务版本策略、资源删除/归档、快照 token 与分页一致性。
- 使用事件的唯一身份、发生时间与接收时间、迟到事件处理、调用计数是否包含失败/重试及其去重规则。v1 当前按事件条数计数。
- 数据权限对名称、知识正文、材料/资源关联、模型服务信息及使用事件的可见范围。统计和目录必须采用同一权限范围，避免越权推断或总量不一致；本轮没有认证和权限实现。
- HTTP 传输错误、认证失败、权限拒绝、超时和未知版本的可恢复性。未来可增加错误分类，但不得把数据错误吞成正常空数据。
- 服务端来源声明的可信依据；客户端结构校验不能证明记录真实，也不能承担制造认证。

如将工程参考案例纳入本层，另建 Adapter：为案例 ID＋版本建立明确外部身份映射，保存来源与摘要，不修改已发布案例；先约定映射为哪些资源以及去重策略，防止每个案例复制机床/刀具或重复统计同一资源。历史验证证据不得直接变成当前目录资源已制造验证。本阶段不实现 Adapter 或同步程序。

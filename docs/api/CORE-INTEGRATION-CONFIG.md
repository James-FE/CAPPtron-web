# Core 部署配置与适配边界

数据层已由原三阶段原型消费；页面接线范围和验收边界见[真实原型说明](../workflows/CORE-PROTOTYPE-LIVE.md)。接口基础来自 PR27，配置与请求恢复继续保持单独可测试。

## 配置交付

Core 离线包对有可信工程绑定的发布版本生成 `frontend-integration.v1.json`，同时生成 `.sha256` 文件。部署到固定资产目录后，由部署者把配置通过 Web 可访问的静态地址提供；页面接线时显式传入该地址和受控发布摘要。旧版本没有工程绑定时不会伪造可执行配置。

`loadIntegrationConfig(url, expectedSha256)` 针对响应原始 UTF-8 字节校验摘要，不重新序列化 JSON。加载失败、摘要不匹配或版本未知都会报错，没有内置 Golden 配置兜底。摘要用于发布一致性，不是身份认证；应从受信发布记录取得，不把任意远端返回的摘要当作信任依据。

配置的 `templates` 是条目集合，每项含模板三元组、执行 profile 引用、输入/报告/MCAM 匹配摘要、工序/工步描述和参数规则。配置不包含工程原件、NC 正文、连接凭据或机器绝对路径。公共仓库测试仅使用合成数据。

## 展示与执行

调用 `matchIntegrationTemplate(config, plan)` 核对模板、匹配证据、稳定工序/工步身份与参数规则。缺参数元数据时保留只读；不能从字段名称猜单位，也不能把模板配置当成执行许可。

CAM 启动前仍需读取 Core 当前批准归档、修订和 `profile_matches`，提交原版本条件。模板配置匹配、解析成功、软件测试通过均不代表完成本次制造或人工 NC 审核。

## 验证范围

配置单测覆盖 UTF-8 原始字节校验、篡改/加载失败、未知版本、重复身份、模板及报告不匹配、工序和规则不匹配。本地还以 Core 导出的真实配置完成跨语言加载检查；该配置仅保留在私有/本地证据位置，不提交到公共 Web 仓库。

原页面通过受控摘要加载配置，并在任务创建和 CAM 前消费匹配校验。本批未运行新的真实 NX 解析或 NC 生成，不能把前端接线标记为整链制造完成。

## 请求编排与恢复接线

`CoreWorkflow` 是原组件接线的单一请求入口；页面决定何时执行动作，不新增技术工作区。构造时注入 CoreClient、可选的 CommandJournal/命令 ID 生成器以及已加载的配置。默认 journal 使用浏览器存储并按 Core 地址隔离。可通过 `snapshot()` 读取展示状态，通过 `location()` 取得持久定位。

- 上传/解析：`upload`、`retryUpload`、`parse`、`refreshParse`；复用已有解析用 `reuseParse`，只执行查询。未知上传必须重选同名、同大小、同摘要的原文件。
- 工艺：`createTask`、`replan`、`refreshPlanningRun`、`refreshTask`、`approveCard`。草稿通过 `setDraft`/`clearDrafts` 按任务和修订管理；未提交草稿或未决命令阻止批准。
- CAM/NC：`startCam` 重新核对当前任务、配置、批准归档与活动运行；`refreshCam` 和 `loadNc` 读取运行及完整文件清单；`controlCam` 只接受服务端允许的 observe/reconcile 动作。
- 刷新：`recover` 仅查询既有状态。未决请求保留原命令、请求体、版本和审核人，通过 `retryPending` 明确重试；只有结构化 Core 拒绝才允许 `discardRejectedPending` 后提交新意图。代理错误或未知执行结果不能据此丢弃命令。

本周规划恢复限定同一 Core 进程。后端明确返回任务不存在时标为不可恢复，不自动创建替代任务。控制器不负责跨 Core 重启重建规划、跨浏览器同步或多标签协同；这些能力不在本批验收内。

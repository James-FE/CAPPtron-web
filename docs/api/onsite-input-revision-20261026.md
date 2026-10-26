# 模板默认值与补充信息修订

保留原模型输入→工艺决策→程序审核页面布局、左侧待填定位和“提交补充信息”入口。

新Core结果中的 `supplement_contract` 提供字段和预设值；前端不猜测现场数据。已知值显示为模板预设，未知Ra留空。提交使用 `template-onsite-input-v2`，保存反馈后自动调用现有replan，以同一命令身份处理未知响应，并回读新revision。原批准和NC不继承到新修订；尚未提交的加工参数草稿保留到新版本并持久化。

本批Core实际更新工艺方案的毛坯、装夹/坐标要求及内孔Ra；CAM映射尚未完成，不能批准或执行。旧Core未提供契约时保留v1记录行为，不声称已修订工艺。需要与Core配套升级；不会自动重启用户正在测试的后端。

验证：quality（307项测试及构建）；原Core页面双视口40项回归通过。新增用例使用HTTP替身，覆盖默认值、非默认值、丢回执重试、自动修订及加工参数草稿持久化；不是Windows CAM证据。

截图：[1440×900](fe-contract-002-evidence/chromium-1440x900/onsite-v2-revision.png)、[1920×1080](fe-contract-002-evidence/chromium-1920x1080/onsite-v2-revision.png)。截图为合成任务。

本次代码基于PR31的65e7315；PR31未合入时，面向main的PR包含其前置提交。本批增量不修改CSS或页面组件布局。

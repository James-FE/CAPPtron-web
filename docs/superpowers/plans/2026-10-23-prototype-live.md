# 原型真实接线实施计划

**Goal:** 直接在 r06 原型组件中完成真实业务操作。
**Architecture:** Core 状态 hook + API ViewModel adapter + 原型展示组件，示例与真实状态隔离。
**Tech Stack:** React / TypeScript / Vitest / Playwright。

- [x] 抽出 useCoreWorkflow，保留请求恢复、批准版本和 NC 内容保护。
- [x] 为真实计划写适配测试，映射稳定 ID、工步、刀具与可修改参数；复用原 OperationDetails。
- [x] 原型文件选择、文件条和输入准备接线，去掉独立工作区。
- [x] 原型程序区域接入真实只读编辑器、审核及下载。
- [x] 更新交互回归，验证失败隔离与三步流程，执行 quality 和双视口 Playwright。
- [x] 真实回读、截图、更新 PR24 和 issue135。

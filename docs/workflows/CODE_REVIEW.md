# Codex Code Review 配置与验证

## 仓库已经具备什么、尚未自动具备什么

`AGENTS.md` 中的 `## Code Review Rules` 用来约束 Codex 审查范围，重点关注 CAPPtron 特有的业务风险：真实/Mock 边界、动态制造工艺、任务与修订版本，以及人工确认不等于 CAM 或实机安全验证。确定性的格式、类型、测试与构建检查交由 GitHub Actions 完成。

**仓库中存在 GitHub Actions YAML 或 `AGENTS.md`，并不会自动启用官方 Codex 云端 PR 审查。** GitHub 连接权限和自动审查设置位于用于审查的 ChatGPT/Codex 账号或工作区，需要单独核实。

## 在审查账号上启用自动审查

1. 登录专用于代码审查的 ChatGPT/Codex 账号（可称为 Codex B），检查其 GitHub Code Review 功能是否可用。
2. 为审查账号连接 GitHub，并授予 `James-FE/CAPPtron-web` 所需的仓库访问权限；配置自动审查可能需要相应的仓库权限。
3. 打开 `https://chatgpt.com/codex/cloud/settings/code-review`（如入口调整，使用当前 Code Review 设置页）。
4. 选择 `James-FE/CAPPtron-web`，在 **Review code** 下启用 **Automatic review**，按当前产品界面设置触发方式。
5. 使用独立小型功能分支创建测试 PR，确认 Codex 能自动提交 Review；也可在 PR 中用 `@codex review` 请求审查（以当时可用能力为准）。
6. 若同一仓库连接了多个 Codex 账号，核对实际使用的是哪个审查身份和额度，不要以为第二个账号登录后就会自动替换审查身份。
7. 审查工作流不启用自动修复与自动合并。Codex B 负责指出问题，开发者或维护者决定怎样修改，以及是否合并。

## 角色分工

- **Codex A（开发）**：实现功能、运行验证、提交 PR，不得仅凭自己的检查宣称业务正确。
- **Codex B（审查）**：审阅 Diff、测试证据与领域约束，提出可复现、有依据的问题。
- **GitHub Actions（确定性检查）**：运行格式、类型、单测、浏览器 E2E 和构建检查。
- **维护者（最终决策）**：处理评审意见、检查真实界面并决定是否合并。AI 审查无异议不代表 CNC 加工安全认证。

## 两类审查探针

- **应当发现的问题**：只在临时测试分支中，把 `Mock NC verified` 错误显示为真实的 `CAM PASS`，要求 Codex Review 指出真实/Mock 语义错误；测试结束必须撤销危险修改。
- **不应虚报的问题**：增加无害的可访问性标签或纯文本排版优化，检查 Codex 是否避免凭空捏造严重业务缺陷。

## 参考资料

- [Codex GitHub 集成](https://developers.openai.com/codex/third-party/github)
- [Codex 自定义审查规则](https://developers.openai.com/blog/custom-code-review-rules-for-codex)
- [GitHub 仓库 Ruleset 文档](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository)

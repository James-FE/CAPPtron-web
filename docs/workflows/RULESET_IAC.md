# GitHub Ruleset 版本化管理（Ruleset as Code）

本项目以轻量的 Infrastructure as Code（IaC）管理 GitHub Ruleset。`.github/rulesets/main.json` 是提交到仓库中的**期望策略**，GitHub 远程设置是**实际生效的策略**；仅修改 JSON 不会自动修改远程分支规则。

使用要求：Node.js 22+、GitHub CLI `gh`、目标仓库的必要管理权限，以及支持相应 Ruleset 功能的 GitHub 计划。

## PowerShell 命令

```powershell
.\scripts\configure-ruleset.ps1                  # 只读计划（默认）
.\scripts\configure-ruleset.ps1 -Mode Check      # 只读：检查远程策略是否漂移
.\scripts\configure-ruleset.ps1 -Mode Apply      # 显式应用，需输入 APPLY 确认
```

跨平台 npm 命令：

```bash
npm run test:infra
npm run ruleset:plan
npm run ruleset:check
npm run ruleset:apply
```

## 三种运行模式

- **plan**：计算需要创建、更新还是无需修改，并显示不同的策略字段；只读，通常返回退出码 0。
- **check**：对照远程策略；如检测到差异，返回退出码 2，不执行远程写入。
- **apply**：要求显式确认，写入前再次核对远程状态，仅在确实需要时通过 GitHub API 创建或更新 Ruleset，随后回读验证。

`-Yes` / `--yes` 用于**明确批准的无人值守应用**，不是普通开发默认操作。

## 推荐工作流程

1. 在独立分支修改期望策略 JSON，提交 PR，等待 CI 与维护者审查。
2. 合并后更新本地受保护分支，运行 `plan`，认真检查差异。
3. 经维护者批准后运行 `apply`，再运行 `check` 确认状态。
4. 与本项目无关的其他 Ruleset 不会被脚本修改。Codex 自动审查是否启用、仓库 Public/Private 可见性，都不由此工具管理。

脚本保留部分 GitHub API 可能自动增加的默认字段，以避免持续产生虚假的配置漂移。若 GitHub 新增安全策略字段，应检查其意义，不能随意忽略。错误的 Ruleset JSON 可能削弱保护，**不要安排未经审查的自动 apply**。

## 常见故障

- **403**：可能缺少仓库管理权限，或 GitHub 计划不支持目标配置。
- **应用期间远程状态改变**：重新运行 `plan`；脚本不会强制覆盖新的远程状态。
- **发现漂移**：先判断远程变更是否有意进行，再选择恢复仓库期望策略，或将已批准的远程变更正式纳入版本管理。

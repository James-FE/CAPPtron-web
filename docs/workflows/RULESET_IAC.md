# Repository Ruleset as Code

This is lightweight Infrastructure as Code for the GitHub Ruleset named **Protect default branch**. The committed `.github/rulesets/main.json` is the desired policy; GitHub is the actual policy. Updating JSON alone does not change GitHub.

Requirements: Node.js 22+, GitHub CLI `gh`, authentication with repository Administration permission, and a supported GitHub plan.

## PowerShell

```powershell
.\scripts\configure-ruleset.ps1                  # read-only plan (default)
.\scripts\configure-ruleset.ps1 -Mode Check      # read-only drift check
.\scripts\configure-ruleset.ps1 -Mode Apply      # explicit apply; type APPLY to confirm
```

Cross-platform:

```bash
npm run test:infra
npm run ruleset:plan
npm run ruleset:check
npm run ruleset:apply
```

Modes: **plan** prints create/update/no-op and changed policy fields (exit 0); **check** returns exit 2 if remote configuration differs; **apply** requests confirmation, rechecks remote before writing, creates or updates via GitHub API only if required, then verifies by reading back. `-Yes` / `--yes` is for deliberate unattended apply only.

Work on a branch, update the JSON, open a PR and verify CI. After merging, pull main, run plan, inspect changes, run apply, then check. Existing unrelated Rulesets are untouched. Codex review activation and repository visibility are outside this tool's scope.

The policy specifies known GitHub-added defaults to avoid perpetual false drift. If Github introduces new policy parameters, inspect them rather than blindly discarding their security meaning. Do not schedule unattended apply without reviewing policy changes; a misconfigured JSON could weaken protection.

Troubleshooting: A 403 may indicate missing admin permissions or an unsupported private-repository plan. If changed while applying, re-plan; no force overwrite is attempted. If drift is detected, choose whether to restore committed desired state with apply or review and commit the intentional remote changes.

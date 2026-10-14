# GitHub repository provisioning and branch protection

Target: `James-FE/CAPPtron-web` (private). These instructions do not imply a remote repository already exists.

## Provisioning

1. Install Node.js 22.12+, Git and GitHub CLI. Run `gh auth login` as the GitHub owner.
2. Extract the source archive. Verify the local root contains `package.json`, `.github`, `src` and `docs`.
3. Run `./scripts/bootstrap-github.ps1` from PowerShell. This performs `npm install`, creates the real `package-lock.json`, runs formatting and `npm run quality`, initializes Git and publishes the private repository.
4. Visit `https://github.com/James-FE/CAPPtron-web/actions` and verify an actual green `Quality / Frontend Quality` run and a successful `Package / Web Package` artifact.
5. Only after a check is visible, run `./scripts/configure-ruleset.ps1`. It sends `.github/rulesets/main.json` to the GitHub Rulesets API. Uploading JSON without running this command does not protect a branch.
6. Create a tiny `codex/...` branch, open a PR and verify `Frontend Quality` is enforced. Do not try to bypass a failing check by merging directly to `main`.

## Branch rules

- Require PRs for main branch changes.
- Require the exact check **`Frontend Quality`** to pass with up-to-date branch code.
- Require review conversations to be resolved; do not require a second human approval while the project has just one human maintainer.
- Block force pushes and default-branch deletion.
- Revisit required approvals when there are two genuine human maintainers. A Codex review comment is not automatically a human APPROVE.

**GitHub plan requirement:** rulesets for private repositories require an eligible paid GitHub plan such as Pro/Team/Enterprise. If the current account does not support private rulesets, keep the repo private, use PR discipline and CI reporting, and do not claim enforcement is active. Upgrade or relocate only with the owner's explicit decision.

## Credentials and security

- The bootstrap uses local `gh` authentication. It never stores a GitHub token in source control.
- CI needs only `contents: read`, and does not need SSH keys, OpenAI API keys or CAM credentials.
- The Node `VITE_` namespace is public browser config, **not a secret store**.
- Only connect authorized ChatGPT/Codex workspaces to the private repository.

## CI verification checklist

- [ ] Repo is private and default branch is `main`.
- [ ] `package-lock.json` is committed and `npm ci` passes.
- [ ] `Quality / Frontend Quality` green on `main`.
- [ ] `Package / Web Package` uploads `dist/` after a `main` push.
- [ ] Ruleset shown as **active**, not merely a JSON file in the repository.
- [ ] An intentionally failing PR check blocks merge.
- [ ] Codex reviewer test produces actual GitHub PR feedback.

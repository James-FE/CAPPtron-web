# Codex Code Review setup and verification

## What is and is not configured in the repository

`AGENTS.md` includes a scoped `## Code Review Rules` section. It tells Codex to focus on semantic issues important to CAPPtron: real/Mock boundaries, dynamic manufacturing plans, task versions, and not equating human review with CAM execution safety. Mechanical checks are delegated to GitHub Actions.

**A GitHub Actions YAML file alone cannot turn on the official Codex cloud PR review.** The Codex GitHub connector, repository permission and auto-review setting live in the reviewing ChatGPT/Codex account or workspace.

## Enable automatic review using the reviewer account

1. Log in to the ChatGPT/Codex account designated for reviewing (Codex B). Confirm it is eligible for GitHub cloud code review.
2. Connect the account's GitHub integration with access to the private `James-FE/CAPPtron-web` repository. Use a GitHub identity with the needed repository permission; configuring auto-reviews requires GitHub push or admin permission.
3. Open `https://chatgpt.com/codex/cloud/settings/code-review` (or the current Code Review settings page).
4. Select `James-FE/CAPPtron-web` and enable **Automatic review** under **Review code**. Choose review trigger / review preferences appropriately.
5. Open a small test PR from a `codex/...` branch. Confirm Codex posts a review, either automatically or after a PR comment containing the exact text `@codex review`.
6. Verify which account/workspace owns the review quota when the same GitHub repository is connected to multiple Codex accounts. Do not assume a second login automatically selects the reviewer identity.
7. Keep auto-fix and auto-merge disabled in the reviewer workflow. Codex B should report defects; the developer account or maintainer decides how to patch and merge.

## Review roles

- Codex A: implements changes and opens PRs; should not self-certify correctness.
- Codex B: reads diff, tests, domain rules, and raises actionable high-severity findings.
- GitHub Actions: deterministic syntax, formatting, unit tests and production build.
- Maintainer: resolves review threads and performs the final merge. Do not interpret a clean AI review as machining safety certification.

## First two review probes

- **Positive probe:** in a test branch only, temporarily change a display path to label `Mock NC verified` as real `CAM PASS`; ask Codex to review. It should flag the misleading real/Mock boundary. Revert the unsafe change before merging.
- **Negative probe:** add a harmless accessible label / plain text layout refinement. Codex should avoid inventing serious business defects.

## References

- Official GitHub integration: https://developers.openai.com/codex/third-party/github
- Official project rules guidance: https://developers.openai.com/blog/custom-code-review-rules-for-codex
- Branch rules: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository

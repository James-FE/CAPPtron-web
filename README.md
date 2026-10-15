# CAPPtron-web

React + TypeScript + Vite frontend repository for the CNC Agentic Programming project.

**Status: engineering bootstrap only.** The current application is a working UI *skeleton*, not the final Figma r06 product. It does not parse STEP files, generate CAM toolpaths, perform an Agent planning run, approve executable NC files, or call Mastercam. The design baseline is preserved in [`docs/architecture/frontend-architecture.md`](docs/architecture/frontend-architecture.md).

## Reference projects

- Figma r06: [CAPPtron r06 design](https://www.figma.com/design/87LfnDXn7hlAF5NiaQVNPK)
- Backend: [James-FE/CAPPtron-core](https://github.com/James-FE/CAPPtron-core)
- Engineering precedent: [cosmic-snail/CAPPtron-core](https://github.com/cosmic-snail/CAPPtron-core)

## Local development

Requirements: Node.js 22.12+ and npm.

```bash
npm install
npm run dev
```

The first `npm install` creates `package-lock.json`. **Commit that lockfile with the initial repository commit.** Thereafter use `npm ci` for reproducible clean installs.

```bash
npm run quality
npm run build
npm run preview
```

The `dist/` directory is a static Web build. It is not a Python wheel and does not need a published npm package.

## Browser acceptance tests

```bash
npm ci
npx playwright install chromium
npm run test:e2e
npm run test:e2e:report
```

On Linux/CI, use `npx playwright install --with-deps chromium` to also install system dependencies. Re-run browser installation after upgrading Playwright. Browser binaries stay in Playwright's user cache, outside Git.

Playwright automatically starts Vite at `http://127.0.0.1:5173`. Local runs may reuse a running server at that address; CI always starts its own server. For live preview with HMR, run `npm run dev` separately and open that address. Stop it with Ctrl+C. `npm run test:e2e:ui` opens the interactive test runner; `npm run test:e2e -- --headed` runs visible Chromium.

The scaffold smoke suite runs in real Chromium at **1920x1080** and **1440x900**. It checks the workspace, uncaught runtime errors, key elements in the viewport, horizontal overflow, and all three workflow selections and matching details. Browser requests to other origins are blocked, so no FastAPI, Mastercam, or internet service is required during tests.

Each viewport's loading test attaches a full-page `workspace.png` screenshot to the HTML report (`playwright-report/index.html`); original PNGs are under `test-results/`. Failed tests retain a failure screenshot, error context, and `trace.zip` there, linked from the report. Open a trace locally with `npx playwright show-trace <path-to-trace.zip>`. Reports are generated even for failed tests; server/browser installation failures may happen before screenshots can be captured.

On the PR's **Quality / Chromium E2E** job, download the **playwright-results** artifact (14-day retention). Extract it and run `npx playwright show-report <extracted-path>/playwright-report` to browse screenshots and failure diagnostics. Both generated directories are ignored by Git.

These screenshots are evidence, not approved visual regression baselines. No `toHaveScreenshot` comparisons are enabled. For FE-001, extend the suite for actual r06 navigation, dynamic fixtures, empty/loading/error states, drawers, and review interactions; establish visual baselines only after Figma comparison and human visual approval.

## Automated checks

- `.github/workflows/quality.yml`: on each PR and `main` push, run repository validation, ESLint, Prettier, `tsc`, Vitest and a production Vite build, plus an independent Chromium E2E job for both desktop viewports with report/diagnostic artifacts.
- `.github/workflows/package.yml`: on `main` push or manual dispatch, build and upload `dist/` as a GitHub Actions artifact, retained for 30 days.
- `.github/rulesets/main.json`: desired protected-main policy; it is **not activated merely by committing the JSON file**.
- `AGENTS.md`: Codex development conventions and dedicated `## Code Review Rules` for PR reviews; it **does not enable Codex automatic review by itself**.

See [`docs/workflows/GITHUB_SETUP.md`](docs/workflows/GITHUB_SETUP.md) and [`docs/workflows/CODE_REVIEW.md`](docs/workflows/CODE_REVIEW.md).

## One-command GitHub provisioning (Windows PowerShell)

After extracting this project, install [GitHub CLI](https://cli.github.com/), configure `git config user.name` and `user.email`, then sign in with `gh auth login`.

```powershell
.\scripts\bootstrap-github.ps1
```

The script installs dependencies, generates and commits `package-lock.json`, formats and tests the project, initializes Git, and creates/pushes the private `James-FE/CAPPtron-web` repository (or pushes to an existing one). If GitHub already contains commits in that repository, reconcile the branch before pushing.

After the first successful `Quality` run on `main`, configure branch rules:

```powershell
.\scripts\configure-ruleset.ps1
```

For private repositories, enforceable Rulesets require an eligible GitHub subscription (e.g., Pro/Team). Codex PR auto-review is configured separately in Codex settings with the designated reviewer account.

## Architecture boundaries

- Browser -> CAPPtron-core FastAPI only; no direct Mastercam, SSH, local Windows worker or CAM SDK calls.
- The task/operation/revision/feedback IDs and server business state originate from the backend.
- Distinguish process-card approval from NC program approval and machining safety.
- Mock examples never count as real manufacturing results.
- First implement P0 dynamic business UI; STEP 3D preview remains a future enhancement.

See the full approved initial design under `docs/architecture/` before implementing pages.

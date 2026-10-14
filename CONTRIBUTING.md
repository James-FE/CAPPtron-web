# Contributing

1. Follow `AGENTS.md` and the accepted design in `docs/architecture/frontend-architecture.md`.
2. Branch from `main` with names such as `codex/process-planning` or `feat/model-input`.
3. Install with `npm ci` and run `npm run quality` before opening a PR.
4. Describe behavior changes and Mock/backend boundaries in the PR template.
5. Wait for `Frontend Quality` to pass and read Codex Code Review findings.
6. Fix real issues, resolve discussions, and merge by PR. Do not bypass main protection.

When new dependencies are required, use `npm install` and commit both `package.json` and `package-lock.json`. Do not commit generated `dist/`, local credentials, or internal CAM data fixtures.

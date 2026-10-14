# Testing strategy (initial)

This repository currently has one React interaction smoke suite for the bootstrap screen. It does not constitute acceptance of r06 business workflows.

Local checks:

```sh
npm ci
npm run verify:repo
npm run lint
npm run format:check
npm run typecheck
npm run test:ci
npm run build
```

The initial `npm install` is only for generating the lockfile before the first commit. Use `npm ci` afterwards.

Next P0 coverage should include dynamic operation lists (0/1/many), missing steps and parameters, parameter provenance, agent drawer state persistence, mock review semantics and empty/loading/error states. Add Playwright after the core workflow becomes navigable; don't make an empty E2E suite a blocking check.

CI is independent of the backend for this bootstrap; integration tests against CAPPtron-core should be added only when the HTTP endpoints and schema versions are pinned and verified.

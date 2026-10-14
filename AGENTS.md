# CAPPtron-web agent instructions

## Project purpose

Build and maintain a desktop-first CNC Agentic Programming web UI based on the approved Figma r06 design. The core flow is Model Input -> Process Planning -> Program Review; the Data Foundation is a separate page. This repository is the browser frontend, not a CAM controller.

Read `docs/architecture/frontend-architecture.md` before changing application boundaries or substantial UI behavior. Keep the code modular, typed, and practical. New dependencies must have a concrete P0/P1 use case. Do not introduce an elaborate workflow engine, backend-for-frontend, 3D CAD engine, or real-time transport to implement a placeholder.

## Development checks

- Prefer feature branches and PRs rather than direct pushes to main.
- Run `npm run quality` before requesting review; CI is the hard quality gate.
- Keep the lockfile in sync when changing dependencies. CI uses `npm ci`.
- Keep API transport and source-to-view-model mapping in `src/api`; pages should not call Mastercam, local Windows endpoints, or arbitrary business HTTP URLs.
- Use stable IDs for tasks, operations, steps, results and revisions; do not use array indices as business identifiers.

## Code Review Rules

### 1. Protect real-versus-Mock boundaries

Flag code that labels client-only selections, sample process plans, fake NC text, placeholder 3D models or simulated Agent replies as successful server-side preparation, CAM execution, NC validation, or real approval. Safe behavior is to label the fixture/source and keep simulated actions from triggering downstream real workflows.

### 2. Preserve task, revision, and review semantics

Flag a code path that uses stale task/revision/feedback versions to submit a mutation or that equates process-card approval with NC-program approval or machining safety. `CAPPtron-core` owns business state and version checks. Displaying an approved process card must not automatically mark an NC program verified or executable.

### 3. Render manufacturing data dynamically

Flag hard-coded assumptions about the demo `Ring_A.step`, exactly nine operations, fixed numbers of steps, or guaranteed presence of parameters, tools, and measurements in shared components. An explicit named demo fixture is acceptable if the general component supports zero, one and many operations and missing fields.

### 4. Keep the browser outside the CAM trust boundary

Flag browser code that reaches Mastercam, SSH, IPC, Windows worker controls or sensitive manufacturing credentials directly. Only authenticated/authorized backend APIs may eventually request machine-side actions. Public `VITE_` variables are not a secret store.

## Review scope

Prioritize serious behavioral regressions, contract mismatches, false verification claims and security boundaries. Leave stylistic formatting to ESLint, Prettier and TypeScript CI. For every issue, cite the changed code path and an input scenario that triggers it; avoid hypothetical low-confidence findings.

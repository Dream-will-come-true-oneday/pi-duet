# M1 Runtime Tasks

## M1-T01: Smoke-test upstream on this machine

**Files:** none
**Depends:** none

**Steps:**
1. Confirm `node --version` is >= 22.19.
2. Run `node -e "import('node:sqlite').then(m => console.log(Object.keys(m).includes('DatabaseSync')))"`.
3. From the repo root, run `node --conditions=source --experimental-strip-types -e "import('@earendil-works/pi-durable').then(m => console.log(typeof m.Harness))"`.

**Verify:** both commands print `true` / `function`. If the durable import fails, stop and record the Node incompatibility before writing code.

## M1-T02: Package scaffold

**Files:** create `packages/personal-agent/package.json`, `tsconfig.build.json`, `vitest.config.ts`, `src/index.ts`
**Depends:** M1-T01

**Steps:**
1. Add the package with the pinned deps from `plan.md`; no `any`, no extra deps.
2. Point `bin.pi-personal` at `dist/cli.js`.
3. `tsconfig.build.json` extends `../../tsconfig.base.json`, emits `dist`, maps durable/ai dist types.
4. `vitest.config.ts` resolves durable/ai/telemetry to source with `conditions: ["source"]`.
5. `src/index.ts` exports the package version only for now.

**Verify:** run `npm install --ignore-scripts --no-audit --no-fund` with the workspace-local cache; then `node -e "console.log(require('./packages/personal-agent/package.json').name)"` prints `pi-personal-agent`.

## M1-T03: Durable docs

**Files:** create `src/docs.ts`, `test/docs.test.ts`
**Depends:** M1-T02

**Steps:**
1. Define `PersonalSettingsDoc`, `PersonalRuntimeDoc`, `PersonalAuditDoc` with `defineDoc`.
2. Add defaults and bounds: 100 tick ids, 200 audit entries.
3. Add `hashToken` and `newToken` helpers using `node:crypto`.
4. Test defaults, bounds, token round-trip.

**Verify:** run the specific vitest file; expect exit 0 and all tests passed.

## M1-T04: Harness bootstrap

**Files:** create `src/harness.ts`, `test/harness.test.ts`
**Depends:** M1-T03

**Steps:**
1. Implement `openPersonalAgent` with data dir, SQLite storage prefix `pi_`, registry, extension, root conversation.
2. Initialize docs and create the scheduler task in one root commit; store the task id.
3. Implement `close()` and a read-only option for status.
4. Test create/reopen, settings persistence, and a single scheduler task after two opens.

**Verify:** run `test/harness.test.ts`; expect no duplicate scheduler task and persisted settings.

## M1-T05: Crash-safe scheduler task

**Files:** create `src/scheduler.ts`, `test/scheduler.test.ts`
**Depends:** M1-T04

**Steps:**
1. Define `SchedulerTask` with `tick` phase and `intervalMs` input.
2. Commit tick counter, tick id, next time, audit entry, and sleep in one `runtime.commit`.
3. Bound tick ids and audit entries.
4. Test two ticks with a 50 ms interval, unique ids, and reopen continuity.

**Verify:** run `test/scheduler.test.ts`; expect monotonic tick count and zero duplicate ids after reopen.

## M1-T06: Token-protected HTTP app

**Files:** create `src/web.ts`, `test/web.test.ts`
**Depends:** M1-T05

**Steps:**
1. Build the Hono app with `/`, `/api/health`, `/api/state`, `/api/events`.
2. Add Bearer/cookie/query token auth; set the cookie on query bootstrap; never log query strings.
3. Return 401 JSON for missing or wrong token.
4. Test 401/200, state shape, and cookie bootstrap through `app.request`.

**Verify:** run `test/web.test.ts`; expect 401 without token and 200 with a valid token.

## M1-T07: CLI

**Files:** create `src/cli.ts`, `src/index.ts` exports update, `test/cli.test.ts`
**Depends:** M1-T04, M1-T06

**Steps:**
1. Implement `init`, `serve`, `status`, `token reset` with `node:util` `parseArgs`.
2. `init` writes the token hash, prints the token once, and creates the data dir.
3. `serve` binds `127.0.0.1`, starts the app, and closes on SIGINT/SIGTERM.
4. `status` opens read-only and prints tick count, next tick, scheduler id, token state, DB path.
5. Test `init` and `status` with a temp data dir.

**Verify:** run `test/cli.test.ts`; expect init output contains a token and status reports a scheduler task.

## M1-T08: Shutdown and restart test

**Files:** create `scripts/m1-restart.mjs`
**Depends:** M1-T07

**Steps:**
1. Spawn the source CLI on a free port with a temp data dir.
2. Read state with the token, SIGKILL the child, restart, poll until the tick count increases.
3. Assert no duplicate tick ids; print cold start, recovery, count, duplicates as JSON.
4. Ensure the script exits non-zero on assertion failure and cleans up temp state.

**Verify:** run `node scripts/m1-restart.mjs`; expect `duplicateTickIds: 0` and `recoveryMs` below two intervals.

## M1-T09: Engineering checks

**Files:** none beyond fixes
**Depends:** M1-T05, M1-T06, M1-T07, M1-T08

**Steps:**
1. Run `npm run check` from the repo root with full output; fix every error, warning, and info in files touched by M1.
2. Run each M1 vitest file individually.
3. Do not run `npm run build` or the full suite.

**Verify:** `npm run check` exits 0; each M1 test file exits 0.

## M1-T10: Evidence and demo

**Files:** update `modules/01-runtime/checklist.md`, `resume.md`
**Depends:** M1-T09

**Steps:**
1. Record the restart script JSON, check result, and test results in the checklist.
2. Measure idle CPU over 60 seconds and cold start; write the actual numbers.
3. Update the M1 row in `resume.md` only with measured values.
4. Run the demo from a clean data dir once and record the commands.

**Verify:** checklist has no empty evidence cell; resume M1 row has measured values.

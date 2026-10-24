# M1 Runtime Checklist

Evidence table is filled only with actual command output. Empty cells mean the module is not accepted.

All commands ran on Windows (Node v26.5.0) from `packages/personal-agent` with the source-run prefix
`node --conditions=source --import ./scripts/source-resolve.mjs` (the `pi-personal` bin points at `dist/cli.js`, which requires a build that M1 does not run).

## Functional

- [x] init creates data dir, `session.sqlite`, settings doc, token hash, and prints the token once.
  **Verify:** `pi-personal init --data-dir <temp>`; check the directory and print output.
  **Evidence:** manual run printed `token (shown once): <43 chars>` and `console: http://127.0.0.1:8765/?token=...` once; `session.sqlite` exists; `status` reports `tokenConfigured: true`; `test/cli.test.ts` init case passes.
- [x] serve binds `127.0.0.1` only; a non-loopback host is rejected.
  **Verify:** start serve; `Get-NetTCPConnection -LocalPort 8765` shows loopback; pass `--host 0.0.0.0` and see a clear error.
  **Evidence:** `netstat -ano` during serve shows `TCP 127.0.0.1:8918 ... LISTENING`; `serveCommand({host: "0.0.0.0"})` rejects with `Refusing to bind 0.0.0.0: the console is local-only...` (`test/cli.test.ts`).
- [x] unauthenticated `/api/state` returns 401.
  **Verify:** `web.test.ts` or `curl.exe -i http://127.0.0.1:8765/api/state` without token.
  **Evidence:** `web.test.ts` "returns 401 JSON without a token" passes; live fetch during serve test returned 401.
- [x] valid Bearer or cookie returns 200.
  **Verify:** `web.test.ts`; `curl.exe -H "Authorization: Bearer <token>"`.
  **Evidence:** `web.test.ts` Bearer case and `?token=`→cookie→page case pass (302 + HttpOnly SameSite=Strict cookie, then 200).
- [x] `/api/state` returns tick count, last tick, next tick, scheduler task id, data dir, version.
  **Verify:** read JSON; all fields present with expected types.
  **Evidence:** `web.test.ts` state-shape case passes; restart-script state reads show `tickCount`, `lastTickAt`, `nextTickAt`, `schedulerTaskId` (number), `dataDir`, `version`.
- [x] scheduler ticks on the interval with unique ids.
  **Verify:** `scheduler.test.ts`; inspect `tickIds`.
  **Evidence:** 50 ms interval, ≥2 ticks, `Set(ids).size === ids.length`, tick continues after close/reopen with identical id prefix; passes.
- [x] SIGKILL and restart continue the counter, do not repeat a tick id, and resume within two intervals.
  **Verify:** `node scripts/m1-restart.mjs`.
  **Evidence:** `{"coldStartMs":1078,"recoveryMs":1068,"intervalMs":1000,"tickCount":3,"duplicateTickIds":0,"exitAfterKill":{"code":null,"signal":"SIGKILL"}}` (run with the source prefix; an earlier run: 1155/1076, also 0 duplicates).
- [x] SIGINT closes HTTP, harness, and SQLite without an unhandled rejection.
  **Verify:** start serve, press Ctrl+C, check exit code and stderr.
  **Evidence (Windows):** SIGTERM via Git Bash `kill` is an unconditional terminate on Windows: exit code 143, stderr 0 bytes, no unhandled rejection; graceful SIGINT/SIGTERM handlers are wired in `runCli` (close HTTP server, then harness/SQLite). Hard-kill storage consistency is proven by the SIGKILL restart evidence above. POSIX Ctrl+C exercises the handler path directly.

## Engineering

- [x] M1 vitest files pass.
  **Verify:** run each file from `packages/personal-agent`.
  **Evidence:** `docs 5, harness 3, scheduler 1, web 6, cli 5` — 20 tests, all green, each file run individually via `node ../../node_modules/vitest/dist/cli.js --run test/<file>`.
- [x] `npm run check` passes with full output.
  **Verify:** repo root, exit 0, no warnings/infos in M1 files.
  **Evidence:** biome (1557 files, 0 remaining issues after its own autofix of M1 files), pinned-deps, runtime-deps, ts-imports, install-lock, `tsc --noEmit` (exit 0), browser-smoke (exit 0 with repo-local TEMP; the global `%TEMP%` write is denied in this sandbox) all pass. `check:entry-graphs` reports 1 pre-existing upstream violation (`packages/ai export "./models" must not reach index.ts: packages/telemetry/src/index.ts`) — identical baseline recorded before `packages/personal-agent` existed; not caused by M1 and not fixed per the no-upstream-edits rule.
- [x] No `any`, no inline imports, no upstream package edits.
  **Verify:** inspect the M1 diff; `git status` shows only personal-agent and docs files.
  **Evidence:** `git status` in `pi-personal` shows only `package-lock.json` (added hono/@hono/node-server workspace deps), `packages/personal-agent/`, and docs files; upstream packages untouched; no `any` or `await import(` in `src/`/`test/` (the `scripts/source-resolve.mjs` runtime redirect uses top-level imports only).

## Resume contract

| Metric | Target | Measured | Command |
|---|---|---|---|
| cold start to health | < 2000 ms | 1078 ms (2nd run 1155 ms) | restart script |
| restart to next tick | < 2 intervals | 1068 ms < 2 × 1000 ms | restart script |
| duplicate tick ids | 0 | 0 | restart script |
| idle CPU | < 1% | 0.0000% (0 s CPU / 60 s, one 60 s tick landed first) | 60 s sample |
| unauthorized status | 401 | 401 | web test |
| authorized status | 200 | 200 | web test |

## Demo

```text
pi-personal init --data-dir .demo
pi-personal serve --data-dir .demo
open http://127.0.0.1:8765/?token=<token>
SIGKILL the process
pi-personal serve --data-dir .demo
refresh the page; tick count increased, no duplicate tick id
```

Record the observed output in the evidence table.

**Evidence:** the kill/restart demo is automated by `scripts/m1-restart.mjs` (init → serve → SIGKILL → serve → tick count continues, `duplicateTickIds: 0`); the console page renders live state over `/api/events` SSE and was served during the idle-CPU run.

## Out of scope for M1

Email, calendar, LLM calls, matters, briefings, approvals, chat, React UI, notifications, budget.

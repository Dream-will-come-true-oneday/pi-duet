# M1 Runtime Spec

## Goal

Run a durable personal-assistant process on top of pi: one local data directory, one root conversation, a recurring durable scheduler task, a CLI, and a token-protected local console. The process must recover after a hard kill without losing state or duplicating a scheduled tick.

M1 is the runtime substrate. It does not connect email, call models, or approve actions; those are M2-M4.

## User-visible behavior

```text
pi-duet init      create ~/.pi-duet, token, SQLite store, default docs
pi-duet serve     start scheduler and HTTP server on 127.0.0.1:8765
pi-duet status    print tick count, next tick, data dir, token state
```

Opening the console without a token returns 401. Opening `/?token=<token>` sets an HttpOnly cookie and shows the runtime state.

## Scope

- Fork/workspace scaffold under `packages/duet`.
- Durable docs: `personal.settings`, `personal.runtime`, `personal.audit`.
- Scheduler task `personal.scheduler` with a crash-safe tick.
- CLI: `init`, `serve`, `status`, `token reset`.
- HTTP: `/api/health`, `/api/state`, `/api/events` (SSE heartbeat), `/`.
- Tests and a kill/restart evidence script.

## Out of scope

- IMAP/SMTP/ICS, LLM calls, matters, briefings, approvals, chat, React UI, notifications, budget.
- LAN or public access. Loopback only.
- Multi-user or multi-tenant.

## Product spec mapping

| Product requirement | M1 contribution |
|---|---|
| F2 durable process and restart recovery | partial: scheduler survives restart |
| F17 token-protected local console | partial: token auth and loopback bind |
| N2 process crash recovery | partial: durable tick resumes |
| N9 idle CPU and non-blocking console | partial: idle runtime and async HTTP |

## Resume contract

Claim: crash-safe local agent runtime. A hard kill and restart resume the durable scheduler with zero lost or duplicate ticks; the console is loopback-only and token-authenticated.

Measured evidence:

- cold start to `/api/health` under 2 seconds;
- after hard kill, next tick within two intervals;
- no duplicate `tickIds`;
- idle CPU under 1 percent over 60 seconds;
- 401 without token, 200 with token.

## Module acceptance

- M1-AC1 `init` creates the data directory, `session.sqlite`, settings doc, token hash, and prints the token once.
- M1-AC2 `serve` binds `127.0.0.1`; a non-loopback host is rejected.
- M1-AC3 A request without a token returns 401; a valid Bearer token or cookie returns 200.
- M1-AC4 `/api/state` returns tick count, last tick, next tick, scheduler task id, data dir, and version.
- M1-AC5 The scheduler ticks on its interval; every tick has a unique id and the counter is monotonic.
- M1-AC6 After `SIGKILL` and restart, the counter continues, no tick id repeats, and the next tick arrives within two intervals.
- M1-AC7 `SIGINT` closes the HTTP server, harness, and SQLite storage without an unhandled rejection.
- M1-AC8 `npm run check` passes; M1 vitest files pass.
- M1-AC9 The checklist records the measured resume evidence.

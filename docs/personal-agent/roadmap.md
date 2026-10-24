# Module Roadmap

Each module is designed around one resume-presentable claim. The claim is an acceptance criterion, not a summary written after the fact.

## Contract

A module is done only when all of the following hold:

1. Its resume claim has a measured result from a reproducible command or test.
2. Its demo runs from a clean data directory.
3. Its checklist passes, including regression on earlier modules.
4. `resume.md` is updated with the measured value and evidence path.

## Modules

| Module | Capability | Resume claim | Demo | Key metric | Depends |
|---|---|---|---|---|---|
| M1 runtime | durable harness, scheduler task, CLI, token-protected local console | Crash-safe local agent runtime: SIGKILL and restart resumes the scheduler with zero lost or duplicate ticks | init, serve, kill, restart, state page | recovery time, duplicate ticks, cold start | none |
| M2 connectors | IMAP/SMTP, ICS, keyring, incremental cursor | Incremental email/calendar ingestion: second check fetches no duplicates, one failed source does not block the other | connect real mailbox and ICS, run check-now twice | incremental rows, source isolation | M1 |
| M3 proactive | extraction, matters, dedupe, scoring, briefing, notifications | LLM extraction + deterministic scoring pipeline: cross-source dedupe, zero model calls when nothing is new | seed 10 events, generate brief, run empty check | dedupe ratio, tokens on empty check | M2 |
| M4 approval | approval doc/task, draft, send, injection and high-risk guards | Persistent approval queue with at-most-once send: double approve or restart sends once | draft, approve twice, restart, verify one email | send count, blocked injections | M3 |
| M5 chat/UI | personal extension, tools, threads, SSE, React console, facts, budget | Durable chat console over pi: tool whitelist, staged send, SSE streaming, structured memory | chat about inbox, stage email, approve in UI, edit fact | first-token latency, tool success | M4 |
| M6 hardening | crash/fault tests, autostart, full suite, real account run, metrics | Deterministic evaluation and delivery for a local agent: faux provider/connector tests, restart and concurrency cases, measured cost | run AC1-AC20, collect metrics | test count, coverage, cost/check | M5 |

## M1 resume contract

Claim: based on pi's durable runtime, the assistant survives a hard process kill and resumes scheduling without losing state or duplicating a scheduled tick. The local console is loopback-only and token-authenticated.

Measured evidence:

- cold start to `/api/health` under 2 seconds on the development machine;
- after `SIGKILL`, restart resumes the scheduler and the next tick arrives within two intervals;
- `tickIds` contains no duplicate after kill/restart;
- idle CPU under 1 percent over 60 seconds;
- unauthenticated request returns 401; authenticated request returns 200.

The M1 checklist records the commands and results.

## Design rule

Module documents may narrow scope but may not add product requirements. A new requirement goes to `delta.md` first, then back into `spec.md` after approval.

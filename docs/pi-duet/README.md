# pi-duet

Personal agent built as a second development layer on [pi](https://github.com/earendil-works/pi). The product behavior follows `spec.md`; the runtime is pi's durable agent harness.

## Status

| Module | Status | Resume contract |
|---|---|---|
| M1 runtime | in progress | Crash-safe local agent runtime |
| M2 connectors | not started | Incremental IMAP/ICS ingestion |
| M3 proactive | not started | LLM extraction + deterministic scoring |
| M4 approval | not started | At-most-once approved send |
| M5 chat/UI | not started | Durable chat + local console |
| M6 hardening | not started | Deterministic eval + delivery |

## Why this fork

Claude Duet has no public source. pi is MIT-licensed and provides the durable conversation/task/document runtime, multi-provider LLM layer, and tool/extension model. The personal layer adds the scheduler, email/calendar connectors, approval state machine, safety guards, memory, and web console. See `adr/0001-fork-pi.md`.

## Docs

- `spec.md`: product requirements (copied from endless-code, unchanged)
- `roadmap.md`: module boundaries and resume contracts
- `resume.md`: resume claims, metrics, evidence rules
- `modules/01-runtime/`: M1 spec, plan, tasks, checklist

## Layout

```text
packages/duet/   # new package: harness bootstrap, tasks, CLI, web server
packages/durable/          # upstream, unchanged
packages/ai/               # upstream, unchanged
apps/duet-web/         # added in M5
```

## Rules

- Do not modify upstream packages unless a task says so.
- Pin upstream workspace versions to `1.4.0`; record the upstream commit in the ADR.
- Each module is accepted only when its resume contract has measured evidence.

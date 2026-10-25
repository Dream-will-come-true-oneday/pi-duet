# Resume Ledger

Positioning: second development layer on the MIT-licensed pi agent runtime, not a from-scratch agent framework. Claims about pi core belong to upstream; claims below are the personal layer.

## Claims

| Module | Claim | Evidence |
|---|---|---|
| M1 | Crash-safe local agent runtime: hard kill and restart resume the durable scheduler with zero lost or duplicate ticks; token-protected loopback console | `modules/01-runtime/checklist.md` |
| M2 | Incremental IMAP/SMTP and ICS ingestion: UIDVALIDITY cursor, 50-message batch cap, source isolation, OS keyring credentials, no OAuth | pending |
| M3 | LLM extraction plus deterministic scoring: cross-source dedupe, zero model calls on an empty check, quiet-hour and daily-cap suppression | pending |
| M4 | Persistent approval queue with at-most-once send: atomic claim, restart marks unknown instead of resending, injection quarantine and high-risk refusal | pending |
| M5 | Durable chat console on pi: tool whitelist, staged send, SSE streaming, structured memory, multi-provider model layer | pending |
| M6 | Deterministic evaluation: faux provider/connector tests, restart and concurrent-approval cases, measured cost baseline | pending |

## Metrics

| Metric | Target | Measured | How |
|---|---|---|---|
| Cold start to health | < 2 s | 966 ms (re-measured after the pi-duet rename; pre-rename 1078/1155 ms), Node 26, Windows | `packages/duet/scripts/m1-restart.mjs` |
| Restart to next tick | < 2 intervals | 1021 ms < 2 × 1000 ms interval | kill/restart script |
| Duplicate tick IDs | 0 | 0 (tick count continued across SIGKILL) | state JSON |
| Idle CPU | < 1% | 0.026% (60 s sample) | 60 s sample |
| Unauthorized status | 401 | 401 | web test |
| Authorized status | 200 | 200 | web test |

M1 evidence detail: `modules/01-runtime/checklist.md` (2026-10-24; re-measured 2026-10-25 after the pi-duet rename). `npm run check`: all steps pass except the pre-existing upstream `check:entry-graphs` violation recorded before M1 existed.

## Rules

- No unmeasured number in a resume bullet.
- Every claim links to a checklist row and a command or test.
- The final 4-5 bullets are written at M6, tailored to an Agent/LLM backend role.
- Do not claim the pi runtime, pi-ai providers, or pi-durable scheduler as original work.

## Draft final bullets

1. Extended the MIT-licensed pi durable agent runtime into a local personal assistant: durable scheduler, crash recovery, and a token-protected local console.
2. Built incremental IMAP/SMTP and ICS ingestion with UIDVALIDITY cursors, OS keyring credentials, and per-source failure isolation.
3. Designed an LLM extraction plus deterministic scoring pipeline with cross-source dedupe and a zero-token empty-check path.
4. Implemented a persistent approval queue with at-most-once send and injected-instruction quarantine.
5. Reused pi's durable chat/tool runtime for a streaming local console with a tool whitelist and structured memory.

These are drafts. Replace with measured wording at M6.

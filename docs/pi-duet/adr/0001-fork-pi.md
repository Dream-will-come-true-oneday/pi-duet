# ADR 0001: Fork pi as the runtime base

- Status: accepted (amended 2026-10-25: the repository is a full copy rather than a GitHub fork, and the project is renamed to pi-duet — workspaces `packages/duet` and `apps/duet-web`, CLI `pi-duet`, data dir `~/.pi-duet`; the persisted `personal.*` doc/task identifiers keep the personal-layer naming)
- Date: 2026-10-24
- Upstream: `https://github.com/earendil-works/pi`, commit `136b87e`

## Context

The target is a local, proactive personal assistant with connected email/calendar, scheduled observation, briefings, approvals, and a web console. The original endless-code implementation is Python and would need a durable task runtime, resumable scheduling, budget accounting, and multi-provider model access built from scratch.

Claude Duet has no public source repository. Only public product behavior is available.

pi is MIT-licensed and already provides:

- `pi-durable`: durable conversations, tasks, documents, sleeps, checkpoints, restart recovery, usage/cost, extensions, and hooks;
- `pi-ai`: one provider interface for Anthropic, OpenAI, DeepSeek, Google, and others;
- `pi-agent-core`: agent loop and tool execution;
- TypeScript tooling, vitest, faux provider, and SQLite/JSONL storage adapters.

pi does not provide permissions, email/calendar connectors, a proactive scheduler UI, or a web console. Those remain the personal layer.

## Decision

Fork pi and add two workspaces:

- `packages/duet`: docs, scheduler task, connectors, approval task, tools, CLI, and HTTP server;
- `apps/duet-web`: React console (M5).

Upstream packages are not modified. The upstream commit is pinned; `upstream` stays as a remote for later merges.

The product spec from endless-code is copied unchanged. The plan and tasks are rewritten for the pi architecture.

## Alternatives

1. Copy pi files into endless-code. Rejected: mixes Python and TypeScript toolchains and loses upstream history.
2. Consume pi packages from npm in a separate repo. Rejected for now: the personal layer needs custom tasks/extensions inside the monorepo, and a fork gives reproducible source access.
3. Rebuild the runtime in Python. Rejected: the durable task/checkpoint layer is the hard part and is already available under MIT.

## Consequences

- License: keep `LICENSE`; add `NOTICE` with the upstream copyright and fork statement.
- Upstream API is experimental in places. Pin `1.4.0`; wrap personal code behind the package boundary; re-run personal tests after upstream merges.
- Resume claims must distinguish upstream runtime from the added personal layer.
- Node 26 is installed locally while pi declares `>=22.19`; CI and release verification should use Node 22.19 if Node 26 exposes incompatibilities.

# Changelog

## [Unreleased]

### Added

- M1 durable runtime: `personal.settings`/`personal.runtime`/`personal.audit` durable docs, a crash-safe `personal.scheduler` task (counter, tick id, next time, audit, and sleep in one commit), `pi-duet init/serve/status/token reset`, and a token-protected loopback console (`/`, `/api/health`, `/api/state`, `/api/events` SSE).
- Kill/restart evidence script `scripts/m1-restart.mjs` and the runtime source redirect `scripts/source-resolve.mjs`.

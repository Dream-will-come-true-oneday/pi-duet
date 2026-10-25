# M1 Runtime Plan

## Placement

```text
packages/duet/
├── package.json
├── tsconfig.build.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── docs.ts
│   ├── scheduler.ts
│   ├── harness.ts
│   ├── web.ts
│   └── cli.ts
├── scripts/
│   └── m1-restart.mjs
└── test/
    ├── docs.test.ts
    ├── harness.test.ts
    ├── scheduler.test.ts
    ├── web.test.ts
    └── cli.test.ts
```

No upstream package is edited. `packages/*` is already a workspace glob, so adding this directory is enough.

## Package

`package.json`:

- name `pi-duet`, private, type module, engines `node >=22.19`;
- bin `pi-duet` -> `dist/cli.js`;
- deps pinned exactly: `@earendil-works/pi-durable@1.4.0`, `@earendil-works/pi-ai@1.4.0`, `hono@4.13.13`, `@hono/node-server@2.1.5`;
- devDeps `vitest@4.1.12`, `@types/node@22.19.19`;
- scripts `build: tsc -p tsconfig.build.json`, `test: vitest --run`.

`tsconfig.build.json` extends the root base, emits `dist`, and maps `@earendil-works/pi-durable` / `pi-ai` to their dist types. `vitest.config.ts` resolves the same packages to `src` with `conditions: ["source"]`, like the upstream packages.

## Durable docs

`src/docs.ts` defines three conversation-scoped docs on the root conversation:

```ts
type PersonalSettings = {
  timezone: string;
  tickIntervalMs: number;
  paused: boolean;
  tokenHash: string;
  createdAt: number;
};

type PersonalRuntime = {
  startedAt: number | null;
  schedulerTaskId: string | null;
  tickCount: number;
  tickIds: string[];
  lastTickAt: number | null;
  nextTickAt: number | null;
};

type PersonalAudit = {
  entries: { at: number; event: string; detail: string }[];
};
```

All use `defineDoc({ kind: "personal.*", version: 1, scope: "conversation", history: "latest", fork: "current", checkpointWhen: () => false, initial: ... })`. Tick ids and audit entries are bounded to 100 and 200 entries.

## Scheduler task

`src/scheduler.ts` defines:

```ts
type SchedulerInput = { intervalMs: number };
type SchedulerState = { phase: "tick" };
```

`initial: () => ({ phase: "tick" })`; the `tick` phase runs one atomic commit:

```ts
await runtime.commit(async (tx) => {
  const runtimeDoc = await tx.doc(PersonalRuntimeDoc, task.conversationId);
  const audit = await tx.doc(PersonalAuditDoc, task.conversationId);
  runtimeDoc.tickCount += 1;
  runtimeDoc.tickIds.push(tickId);
  runtimeDoc.lastTickAt = now;
  runtimeDoc.nextTickAt = now + interval;
  audit.entries.push({ at: now, event: "scheduler.tick", detail: tickId });
  return { status: "sleeping", until: now + interval, checkpoint: { phase: "tick" } };
}, context);
```

The counter, tick id, next time, audit entry, and sleep are in one commit. A crash before the commit produces no tick; a crash after it resumes the committed sleep. That is the property the resume claim measures.

`PersonalRuntimeExtension = defineExtension({ name: "personal.runtime", tasks: [SchedulerTask] })`.

## Harness bootstrap

`src/harness.ts`:

```ts
openPersonalAgent({
  dataDir,
  now?, setTimer?, readOnly?,
}): Promise<{
  harness: Harness;
  root: Conversation;
  dataDir: string;
  dbPath: string;
}>
```

Steps:

1. `mkdir(dataDir, { recursive: true })`.
2. `openNodeSqliteStorage(join(dataDir, "session.sqlite"), { prefix: "pi_" })`.
3. `createModels()`; empty provider collection is enough in M1.
4. `createRegistry()`; install `PersonalRuntimeExtension`; open `Harness` with `settings: { extensions: [PersonalRuntimeExtension] }`.
5. `root = await harness.root(context)`.
6. One `root.commit` initializes the three docs and creates the scheduler task if `runtime.schedulerTaskId` is null. The task id is written in the same commit as the task creation.
7. Return handles; `close()` closes the harness.

No model provider is configured in M1. A generation request would fail; M1 never sends one.

## CLI

`src/cli.ts` uses `node:util` `parseArgs`; no CLI dependency.

- `pi-duet init [--data-dir]`: create token (`randomBytes(32).toString("base64url")`), open harness, write `sha256(token)` into settings, close, print the token and URL once.
- `pi-duet serve [--data-dir] [--port]`: open harness, create app, listen on `127.0.0.1`, close on SIGINT/SIGTERM.
- `pi-duet status [--data-dir]`: open read-only, print tick count, last/next tick, scheduler task, token configured, DB path.
- `pi-duet token reset [--data-dir]`: generate and store a new hash, print the token once.

Default data directory: `~/.pi-duet`; default port `8765`. Non-loopback host is rejected.

## HTTP

`src/web.ts` uses Hono.

Routes:

- `GET /`: HTML page that fetches `/api/state`; token bootstrap through `/?token=`.
- `GET /api/health`: `{ ok, version, uptimeMs }`.
- `GET /api/state`: settings and runtime snapshot.
- `GET /api/events`: SSE; sends state every 5 seconds and on tick; closes on abort.

Auth middleware:

- accepts `Authorization: Bearer <token>`, cookie `pi_duet_token`, or `?token=`;
- compares SHA-256 digests with `timingSafeEqual`;
- `?token=` sets an HttpOnly, SameSite=Strict cookie and redirects to `/`;
- missing or wrong token -> 401 JSON.

The server logs method and path only; never the query string, because it may contain a token.

## Tests

- `docs.test.ts`: defaults, bounds, hashing helpers.
- `harness.test.ts`: temp dir, create/reopen, settings persisted, scheduler task created once.
- `scheduler.test.ts`: 50 ms interval; two ticks; unique ids; close/reopen continues; no duplicate id.
- `web.test.ts`: Hono `app.request`; 401 without token, 200 with Bearer, state shape, cookie bootstrap.
- `cli.test.ts`: `init` creates files and prints a token; `status` reports values.

Per pi rules, run only specific vitest files; `npm run check` after code changes; do not run `npm run build` or the full suite unless requested.

## Crash evidence

`scripts/m1-restart.mjs`:

1. Spawn `node --conditions=source --experimental-strip-types src/cli.ts serve --port <free> --data-dir <temp>`.
2. Poll `/api/state` with the token.
3. Kill the child with SIGKILL.
4. Restart with the same data dir.
5. Poll until `tickCount` increases; read `tickIds`; assert no duplicate.
6. Print `coldStartMs`, `recoveryMs`, `tickCount`, `duplicateTickIds`.

The script writes a JSON result to stdout; the checklist records it.

## Risks

- Node 26 is installed while pi declares 22.19; the first smoke test must confirm `node:sqlite` and durable import.
- `defineDoc`/`defineTask` types are strict; if an upstream type rejects the doc shape, adjust the doc type rather than casting to `any`.
- Hono's Node adapter and SSE must not keep the process alive after SIGINT; test shutdown.
- `tx.createTask` ownership options must match the durable API; verify with a type check and a two-open test.
- The scheduler interval is fixed at task creation; changing settings requires a new task in M3. M1 documents this.

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Conversation, Harness } from "@earendil-works/pi-durable";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { PersonalRuntimeDoc, PersonalSettingsDoc, verifyToken } from "./docs.ts";
import { VERSION } from "./index.ts";

const TOKEN_COOKIE = "pi_duet_token";

export type ConsoleState = {
	ok: boolean;
	version: string;
	uptimeMs: number;
	dataDir: string;
	timezone: string | null;
	paused: boolean | null;
	tickCount: number;
	tickIds: string[];
	lastTickAt: number | null;
	nextTickAt: number | null;
	schedulerTaskId: number | null;
};

export type WebAppOptions = {
	harness: Harness;
	root: Conversation;
	dataDir: string;
	/** SHA-256 hex of the console token, captured from settings at serve start. */
	tokenHash: string;
};

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pi-duet</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; }
pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; }
</style>
</head>
<body>
<h1>pi-duet</h1>
<p>Runtime state (live):</p>
<pre id="state">loading…</pre>
<script>
const state = document.getElementById("state");
const events = new EventSource("/api/events");
events.onmessage = (event) => {
	state.textContent = JSON.stringify(JSON.parse(event.data), null, 2);
};
</script>
</body>
</html>
`;

/**
 * Token-protected loopback console: `/`, `/api/health`, `/api/state`, and an
 * SSE stream that pushes state on change (ticks) with a 5-second heartbeat.
 * Auth accepts `Authorization: Bearer`, the cookie, or `?token=` bootstrap
 * that exchanges the token for an HttpOnly cookie. The server must log only
 * method and path: query strings may carry the token.
 */
export function createWebApp(options: WebAppOptions): Hono {
	const { harness, root, dataDir, tokenHash } = options;
	const startedAt = Date.now();

	async function readState(): Promise<ConsoleState> {
		const [settings, runtime] = await Promise.all([
			harness.snapshot(PersonalSettingsDoc, root.id, BACKGROUND_CONTEXT),
			harness.snapshot(PersonalRuntimeDoc, root.id, BACKGROUND_CONTEXT),
		]);
		return {
			ok: true,
			version: VERSION,
			uptimeMs: Date.now() - startedAt,
			dataDir,
			timezone: settings?.timezone ?? null,
			paused: settings?.paused ?? null,
			tickCount: runtime?.tickCount ?? 0,
			tickIds: runtime?.tickIds ?? [],
			lastTickAt: runtime?.lastTickAt ?? null,
			nextTickAt: runtime?.nextTickAt ?? null,
			schedulerTaskId: runtime?.schedulerTaskId ?? null,
		};
	}

	const app = new Hono();

	app.use("*", async (c, next) => {
		const url = new URL(c.req.url);
		const bearer = /^Bearer (.+)$/.exec(c.req.header("Authorization") ?? "")?.[1];
		const fromQuery = url.searchParams.get("token");
		const fromCookie = getCookie(c, TOKEN_COOKIE);
		const candidate = bearer ?? fromQuery ?? fromCookie ?? "";
		if (candidate === "" || !verifyToken(candidate, tokenHash)) {
			return c.json({ error: "unauthorized" }, 401);
		}
		if (fromQuery !== null && url.pathname === "/") {
			setCookie(c, TOKEN_COOKIE, fromQuery, {
				path: "/",
				httpOnly: true,
				sameSite: "Strict",
			});
			return c.redirect("/");
		}
		await next();
	});

	app.get("/", (c) => c.html(PAGE_HTML));

	app.get("/api/health", (c) => c.json({ ok: true, version: VERSION, uptimeMs: Date.now() - startedAt }));

	app.get("/api/state", async (c) => c.json(await readState()));

	app.get("/api/events", (c) =>
		streamSSE(c, async (stream) => {
			let lastPayload = "";
			const sendState = async (force: boolean): Promise<void> => {
				const payload = JSON.stringify(await readState());
				if (force || payload !== lastPayload) {
					await stream.writeSSE({ data: payload });
					lastPayload = payload;
				}
			};
			await sendState(true);
			const changes = setInterval(() => {
				void sendState(false).catch(() => {});
			}, 1000);
			const heartbeat = setInterval(() => {
				void stream.writeSSE({ data: lastPayload }).catch(() => {});
			}, 5000);
			stream.onAbort(() => {
				clearInterval(changes);
				clearInterval(heartbeat);
			});
			while (!stream.aborted) {
				await stream.sleep(500);
			}
			clearInterval(changes);
			clearInterval(heartbeat);
		}),
	);

	return app;
}

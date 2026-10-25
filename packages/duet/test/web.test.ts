import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashToken } from "../src/docs.ts";
import { openPersonalAgent, type PersonalAgentHandle } from "../src/harness.ts";
import { createWebApp } from "../src/web.ts";

const dirs: string[] = [];
const handles: PersonalAgentHandle[] = [];

async function tempSetup(token: string): Promise<{ app: ReturnType<typeof createWebApp>; token: string }> {
	const dataDir = await mkdtemp(join(tmpdir(), "pi-duet-"));
	dirs.push(dataDir);
	const handle = await openPersonalAgent({ dataDir });
	handles.push(handle);
	return {
		app: createWebApp({
			harness: handle.harness,
			root: handle.root,
			dataDir,
			tokenHash: hashToken(token),
		}),
		token,
	};
}

afterEach(async () => {
	await Promise.all(handles.splice(0).map((handle) => handle.close()));
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("console auth", () => {
	it("returns 401 JSON without a token", async () => {
		const { app } = await tempSetup("secret-token");
		const res = await app.request("/api/state");
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});

	it("returns 401 for a wrong token", async () => {
		const { app } = await tempSetup("secret-token");
		const res = await app.request("/api/state", {
			headers: { Authorization: "Bearer wrong-token" },
		});
		expect(res.status).toBe(401);
	});

	it("accepts a valid Bearer token", async () => {
		const { app, token } = await tempSetup("secret-token");
		const res = await app.request("/api/health", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; version: string; uptimeMs: number };
		expect(body.ok).toBe(true);
		expect(body.version).toBeTruthy();
		expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
	});

	it("exchanges ?token= for an HttpOnly cookie and redirects", async () => {
		const { app, token } = await tempSetup("secret-token");
		const res = await app.request(`/?token=${token}`);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/");
		const cookie = res.headers.get("set-cookie") ?? "";
		expect(cookie).toContain("pi_duet_token=");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Strict");

		const cookieValue = /pi_duet_token=([^;]+)/.exec(cookie)?.[1];
		const page = await app.request("/", {
			headers: { Cookie: `pi_duet_token=${cookieValue}` },
		});
		expect(page.status).toBe(200);
		expect(await page.text()).toContain("pi-duet");
	});
});

describe("console state", () => {
	it("returns the documented state shape", async () => {
		const { app, token } = await tempSetup("secret-token");
		const res = await app.request("/api/state", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.ok).toBe(true);
		expect(typeof body.version).toBe("string");
		expect(typeof body.dataDir).toBe("string");
		expect(typeof body.tickCount).toBe("number");
		expect(Array.isArray(body.tickIds)).toBe(true);
		expect(body.schedulerTaskId === null || typeof body.schedulerTaskId === "number").toBe(true);
		expect(body.lastTickAt === null || typeof body.lastTickAt === "number").toBe(true);
		expect(body.nextTickAt === null || typeof body.nextTickAt === "number").toBe(true);
	});

	it("serves the console page to an authenticated request", async () => {
		const { app, token } = await tempSetup("secret-token");
		const res = await app.request("/", {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("/api/events");
	});
});

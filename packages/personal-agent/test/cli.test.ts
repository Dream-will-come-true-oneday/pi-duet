import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { afterEach, describe, expect, it } from "vitest";
import { initCommand, isLoopbackHost, serveCommand, statusCommand, tokenResetCommand } from "../src/cli.ts";
import { hashToken, PersonalSettingsDoc, verifyToken } from "../src/docs.ts";
import { openPersonalAgent, type PersonalAgentHandle } from "../src/harness.ts";

const dirs: string[] = [];
const handles: PersonalAgentHandle[] = [];

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "personal-agent-"));
	dirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(handles.splice(0).map((handle) => handle.close()));
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("init", () => {
	it("creates the data dir, database, and a working token", async () => {
		const dataDir = await tempDir();
		const result = await initCommand({ dataDir, port: 9999 });
		expect(existsSync(join(dataDir, "session.sqlite"))).toBe(true);
		expect(result.token).toHaveLength(43);
		expect(result.url).toBe(`http://127.0.0.1:9999/?token=${result.token}`);
		expect(verifyToken(result.token, hashToken(result.token))).toBe(true);

		const status = await statusCommand({ dataDir });
		expect(status.tokenConfigured).toBe(true);
		expect(status.schedulerTaskId).not.toBeNull();
		expect(status.tickCount).toBe(0);
		expect(status.dbPath).toBe(join(dataDir, "session.sqlite"));
	});
});

describe("token reset", () => {
	it("rotates the stored hash", async () => {
		const dataDir = await tempDir();
		const first = await initCommand({ dataDir });
		const { token } = await tokenResetCommand({ dataDir });
		expect(token).toHaveLength(43);
		expect(token).not.toBe(first.token);

		const handle = await openPersonalAgent({ dataDir, readOnly: true });
		handles.push(handle);
		const settings = await handle.harness.snapshot(PersonalSettingsDoc, handle.root.id, BACKGROUND_CONTEXT);
		expect(settings?.tokenHash).toBe(hashToken(token));
		expect(settings?.tokenHash).not.toBe(hashToken(first.token));
	});
});

describe("serve", () => {
	it("rejects non-loopback hosts with a clear error", async () => {
		const dataDir = await tempDir();
		expect(isLoopbackHost("0.0.0.0")).toBe(false);
		expect(isLoopbackHost("127.0.0.1")).toBe(true);
		await expect(serveCommand({ dataDir, host: "0.0.0.0" })).rejects.toThrow(/local-only/);
	});

	it("requires an initialized token", async () => {
		const dataDir = await tempDir();
		await expect(serveCommand({ dataDir })).rejects.toThrow(/init/);
	});

	it("binds loopback and answers health only with the token", async () => {
		const dataDir = await tempDir();
		const init = await initCommand({ dataDir });
		const started = await serveCommand({ dataDir, port: 0 });
		const address = started.server.address();
		const port = typeof address === "object" && address !== null ? address.port : 8765;
		expect(port).toBeGreaterThan(0);

		const denied = await fetch(`http://127.0.0.1:${port}/api/health`);
		expect(denied.status).toBe(401);
		const ok = await fetch(`http://127.0.0.1:${port}/api/health`, {
			headers: { Authorization: `Bearer ${init.token}` },
		});
		expect(ok.status).toBe(200);
		await started.close();
	});
});

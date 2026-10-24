import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { afterEach, describe, expect, it } from "vitest";
import { hashToken, PersonalRuntimeDoc, PersonalSettingsDoc } from "../src/docs.ts";
import { openPersonalAgent } from "../src/harness.ts";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "personal-agent-"));
	dirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("openPersonalAgent", () => {
	it("creates the data directory and database file", async () => {
		const dataDir = join(await tempDir(), "nested", "personal");
		const handle = await openPersonalAgent({ dataDir });
		expect(existsSync(handle.dbPath)).toBe(true);
		await handle.close();
	});

	it("persists settings and keeps one scheduler task across reopens", async () => {
		const dataDir = await tempDir();
		const first = await openPersonalAgent({ dataDir, intervalMs: 1234 });
		await first.root.commit(async (tx) => {
			const settings = await tx.doc(PersonalSettingsDoc, first.root.id);
			settings.tokenHash = hashToken("test-token");
		}, BACKGROUND_CONTEXT);
		const settingsBefore = await first.harness.snapshot(PersonalSettingsDoc, first.root.id, BACKGROUND_CONTEXT);
		const runtimeBefore = await first.harness.snapshot(PersonalRuntimeDoc, first.root.id, BACKGROUND_CONTEXT);
		expect(settingsBefore?.tickIntervalMs).toBe(1234);
		expect(runtimeBefore?.schedulerTaskId).toBeTruthy();
		await first.close();

		const second = await openPersonalAgent({ dataDir });
		const settingsAfter = await second.harness.snapshot(PersonalSettingsDoc, second.root.id, BACKGROUND_CONTEXT);
		const runtimeAfter = await second.harness.snapshot(PersonalRuntimeDoc, second.root.id, BACKGROUND_CONTEXT);
		expect(settingsAfter?.tokenHash).toBe(settingsBefore?.tokenHash);
		expect(runtimeAfter?.schedulerTaskId).toBe(runtimeBefore?.schedulerTaskId);
		await second.close();
	});

	it("reads but rejects writes in read-only mode", async () => {
		const dataDir = await tempDir();
		const setup = await openPersonalAgent({ dataDir });
		await setup.close();

		const viewer = await openPersonalAgent({ dataDir, readOnly: true });
		const settings = await viewer.harness.snapshot(PersonalSettingsDoc, viewer.root.id, BACKGROUND_CONTEXT);
		expect(settings?.timezone).toBe("UTC");
		await expect(
			viewer.root.commit(async (tx) => {
				const doc = await tx.doc(PersonalSettingsDoc, viewer.root.id);
				doc.timezone = "Europe/Berlin";
			}, BACKGROUND_CONTEXT),
		).rejects.toThrow();
		await viewer.close();
	});
});

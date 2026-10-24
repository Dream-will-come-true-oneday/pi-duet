import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { afterEach, describe, expect, it } from "vitest";
import { type PersonalRuntime, PersonalRuntimeDoc } from "../src/docs.ts";
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

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await check()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error("waitFor timed out");
}

describe("scheduler task", () => {
	it("ticks with unique ids and continues across close and reopen", async () => {
		const dataDir = await tempDir();
		const first = await openPersonalAgent({ dataDir, intervalMs: 50 });
		first.harness.resume();
		await waitFor(async () => {
			const runtime = await first.harness.snapshot(PersonalRuntimeDoc, first.root.id, BACKGROUND_CONTEXT);
			return (runtime?.tickCount ?? 0) >= 2;
		});
		const before = await first.harness.snapshot(PersonalRuntimeDoc, first.root.id, BACKGROUND_CONTEXT);
		expect(before?.tickCount).toBeGreaterThanOrEqual(2);
		expect(new Set(before?.tickIds ?? []).size).toBe(before?.tickIds.length);
		expect(before?.lastTickAt).not.toBeNull();
		expect(before?.nextTickAt).not.toBeNull();
		await first.close();

		const second = await openPersonalAgent({ dataDir });
		second.harness.resume();
		await waitFor(async () => {
			const runtime = await second.harness.snapshot(PersonalRuntimeDoc, second.root.id, BACKGROUND_CONTEXT);
			return (runtime?.tickCount ?? 0) > (before?.tickCount ?? 0);
		});
		const after: PersonalRuntime | undefined = await second.harness.snapshot(
			PersonalRuntimeDoc,
			second.root.id,
			BACKGROUND_CONTEXT,
		);
		expect(after?.tickCount).toBeGreaterThan(before?.tickCount ?? 0);
		const ids = after?.tickIds ?? [];
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.slice(0, before?.tickIds?.length ?? 0)).toEqual(before?.tickIds ?? []);
		await second.close();
	});
});

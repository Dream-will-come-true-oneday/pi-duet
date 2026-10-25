import { describe, expect, it } from "vitest";
import {
	DEFAULT_TICK_INTERVAL_MS,
	hashToken,
	initialAudit,
	initialRuntime,
	initialSettings,
	MAX_AUDIT_ENTRIES,
	MAX_TICK_IDS,
	newToken,
	pushAuditEntry,
	pushTickId,
	verifyToken,
} from "../src/docs.ts";

describe("personal docs", () => {
	it("has the documented defaults", () => {
		expect(initialSettings()).toEqual({
			timezone: "UTC",
			tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
			paused: false,
			tokenHash: "",
			createdAt: 0,
		});
		expect(initialRuntime()).toEqual({
			startedAt: null,
			schedulerTaskId: null,
			tickCount: 0,
			tickIds: [],
			lastTickAt: null,
			nextTickAt: null,
		});
		expect(initialAudit()).toEqual({ entries: [] });
	});

	it("bounds tick ids to the newest entries", () => {
		const runtime = initialRuntime();
		for (let i = 0; i < MAX_TICK_IDS + 5; i += 1) {
			pushTickId(runtime, `tick-${i}`);
		}
		expect(runtime.tickIds).toHaveLength(MAX_TICK_IDS);
		expect(runtime.tickIds[0]).toBe("tick-5");
		expect(runtime.tickIds[MAX_TICK_IDS - 1]).toBe(`tick-${MAX_TICK_IDS + 4}`);
	});

	it("bounds audit entries to the newest entries", () => {
		const audit = initialAudit();
		for (let i = 0; i < MAX_AUDIT_ENTRIES + 7; i += 1) {
			pushAuditEntry(audit, { at: i, event: "scheduler.tick", detail: `tick-${i}` });
		}
		expect(audit.entries).toHaveLength(MAX_AUDIT_ENTRIES);
		expect(audit.entries[0]?.detail).toBe("tick-7");
	});
});

describe("token helpers", () => {
	it("round-trips a token through its hash", () => {
		const token = newToken();
		expect(token).toHaveLength(43);
		const stored = hashToken(token);
		expect(stored).toHaveLength(64);
		expect(verifyToken(token, stored)).toBe(true);
		expect(verifyToken(`${token}x`, stored)).toBe(false);
	});

	it("rejects an empty stored hash and malformed input", () => {
		expect(verifyToken(newToken(), "")).toBe(false);
		expect(verifyToken(newToken(), "not-hex")).toBe(false);
	});
});

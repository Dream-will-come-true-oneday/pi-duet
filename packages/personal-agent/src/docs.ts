import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { defineDoc, type TaskId } from "@earendil-works/pi-durable";

/** Bounded history kept in durable docs so commits stay small over long runs. */
export const MAX_TICK_IDS = 100;
export const MAX_AUDIT_ENTRIES = 200;

export type PersonalSettings = {
	timezone: string;
	/** Fixed at scheduler task creation in M1; M3 makes it live. */
	tickIntervalMs: number;
	paused: boolean;
	/** SHA-256 hex of the console token; empty until `init` writes one. */
	tokenHash: string;
	createdAt: number;
};

export type PersonalRuntime = {
	startedAt: number | null;
	schedulerTaskId: TaskId | null;
	tickCount: number;
	tickIds: string[];
	lastTickAt: number | null;
	nextTickAt: number | null;
};

export type PersonalAuditEntry = { at: number; event: string; detail: string };

export type PersonalAudit = {
	entries: PersonalAuditEntry[];
};

export const DEFAULT_TICK_INTERVAL_MS = 60_000;

export const initialSettings = (): PersonalSettings => ({
	timezone: "UTC",
	tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
	paused: false,
	tokenHash: "",
	createdAt: 0,
});

export const initialRuntime = (): PersonalRuntime => ({
	startedAt: null,
	schedulerTaskId: null,
	tickCount: 0,
	tickIds: [],
	lastTickAt: null,
	nextTickAt: null,
});

export const initialAudit = (): PersonalAudit => ({
	entries: [],
});

export const PersonalSettingsDoc = defineDoc<PersonalSettings>({
	kind: "personal.settings",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: initialSettings,
	checkpointWhen: () => false,
});

export const PersonalRuntimeDoc = defineDoc<PersonalRuntime>({
	kind: "personal.runtime",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: initialRuntime,
	checkpointWhen: () => false,
});

export const PersonalAuditDoc = defineDoc<PersonalAudit>({
	kind: "personal.audit",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: initialAudit,
	checkpointWhen: () => false,
});

/** Append a tick id, keeping only the newest MAX_TICK_IDS entries. */
export function pushTickId(runtime: PersonalRuntime, tickId: string): void {
	runtime.tickIds.push(tickId);
	if (runtime.tickIds.length > MAX_TICK_IDS) {
		runtime.tickIds.splice(0, runtime.tickIds.length - MAX_TICK_IDS);
	}
}

/** Append an audit entry, keeping only the newest MAX_AUDIT_ENTRIES entries. */
export function pushAuditEntry(audit: PersonalAudit, entry: PersonalAuditEntry): void {
	audit.entries.push(entry);
	if (audit.entries.length > MAX_AUDIT_ENTRIES) {
		audit.entries.splice(0, audit.entries.length - MAX_AUDIT_ENTRIES);
	}
}

/** 32 random bytes, URL-safe: the console token printed once by `init`. */
export function newToken(): string {
	return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
	return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of a candidate token against the stored hash. */
export function verifyToken(token: string, storedHash: string): boolean {
	if (storedHash.length === 0) {
		return false;
	}
	const candidate = createHash("sha256").update(token, "utf8").digest();
	const stored = Buffer.from(storedHash, "hex");
	return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

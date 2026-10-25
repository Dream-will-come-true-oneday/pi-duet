import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { type Conversation, createRegistry, Harness, type SetTimer } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { DEFAULT_TICK_INTERVAL_MS, PersonalAuditDoc, PersonalRuntimeDoc, PersonalSettingsDoc } from "./docs.ts";
import { PersonalRuntimeExtension, SchedulerTask } from "./scheduler.ts";

export type PersonalAgentHandle = {
	harness: Harness;
	root: Conversation;
	dataDir: string;
	dbPath: string;
	close: () => Promise<void>;
};

export type OpenPersonalAgentOptions = {
	dataDir: string;
	/** Scheduler interval for a fresh data directory; fixed once the task exists (M1 limit, M3 makes it live). */
	intervalMs?: number;
	now?: () => number;
	setTimer?: SetTimer;
	readOnly?: boolean;
};

/**
 * Open the personal agent on one SQLite-backed durable session: storage,
 * registry with the personal extension, root conversation, and one commit
 * that initializes the three docs and creates the scheduler task exactly
 * once. Read-only opens skip the commit and can only read.
 */
export async function openPersonalAgent(options: OpenPersonalAgentOptions): Promise<PersonalAgentHandle> {
	await mkdir(options.dataDir, { recursive: true });
	const dbPath = join(options.dataDir, "session.sqlite");
	const storage = await openNodeSqliteStorage(dbPath, { prefix: "pi_" });
	const registry = createRegistry();
	registry.install(PersonalRuntimeExtension);
	const now = options.now ?? Date.now;
	const harness = await Harness.open(
		storage,
		{
			models: createModels(),
			registry,
			now,
			setTimer: options.setTimer,
			readOnly: options.readOnly,
		},
		BACKGROUND_CONTEXT,
	);
	const root = await harness.root(BACKGROUND_CONTEXT);
	if (!options.readOnly) {
		await root.commit(async (tx) => {
			const settings = await tx.doc(PersonalSettingsDoc, root.id);
			const runtime = await tx.doc(PersonalRuntimeDoc, root.id);
			await tx.doc(PersonalAuditDoc, root.id);
			if (settings.createdAt === 0) {
				settings.createdAt = now();
				settings.tickIntervalMs = options.intervalMs ?? DEFAULT_TICK_INTERVAL_MS;
			}
			if (runtime.startedAt === null) {
				runtime.startedAt = now();
			}
			if (runtime.schedulerTaskId === null) {
				const taskId = await tx.createTask(
					SchedulerTask,
					{ intervalMs: settings.tickIntervalMs },
					{ ownership: { kind: "conversation" } },
				);
				runtime.schedulerTaskId = taskId;
			}
		}, BACKGROUND_CONTEXT);
	}
	return {
		harness,
		root,
		dataDir: options.dataDir,
		dbPath,
		close: () => harness.close(BACKGROUND_CONTEXT),
	};
}

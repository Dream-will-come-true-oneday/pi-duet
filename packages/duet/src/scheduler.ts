import { defineExtension, defineTask } from "@earendil-works/pi-durable";
import { PersonalAuditDoc, PersonalRuntimeDoc, pushAuditEntry, pushTickId } from "./docs.ts";

export type SchedulerInput = { intervalMs: number };
export type SchedulerState = { phase: "tick" };

/**
 * Crash-safe recurring tick. One `runtime.commit` advances the counter,
 * appends the tick id, records times, writes the audit entry, and stores the
 * next sleep: a crash before the commit produces no tick; a crash after it
 * resumes the committed sleep. The counter and its tick id are written
 * together, so ids never repeat across restarts.
 */
export const SchedulerTask = defineTask<SchedulerInput, SchedulerState, null>({
	name: "personal.scheduler",
	version: 1,
	initial: () => ({ phase: "tick" }),
	phases: {
		tick: async (task, runtime, context) => {
			const now = runtime.now();
			await runtime.commit(async (tx) => {
				const runtimeDoc = await tx.doc(PersonalRuntimeDoc, task.conversationId);
				const audit = await tx.doc(PersonalAuditDoc, task.conversationId);
				runtimeDoc.tickCount += 1;
				const tickId = `${task.id}:${runtimeDoc.tickCount}`;
				pushTickId(runtimeDoc, tickId);
				runtimeDoc.lastTickAt = now;
				runtimeDoc.nextTickAt = now + task.input.intervalMs;
				pushAuditEntry(audit, { at: now, event: "scheduler.tick", detail: tickId });
				return {
					status: "sleeping",
					until: now + task.input.intervalMs,
					checkpoint: { phase: "tick" },
				};
			}, context);
		},
	},
	abort: async (_task, runtime, context) => {
		await runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" as const } }), context);
	},
});

export const PersonalRuntimeExtension = defineExtension({
	name: "personal.runtime",
	tasks: [SchedulerTask],
});

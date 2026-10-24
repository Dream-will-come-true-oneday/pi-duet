export const VERSION = "0.1.0";

export {
	DEFAULT_PORT,
	defaultDataDir,
	type InitResult,
	initCommand,
	isLoopbackHost,
	runCli,
	type ServeHandle,
	type StatusReport,
	serveCommand,
	statusCommand,
	tokenResetCommand,
} from "./cli.ts";
export {
	DEFAULT_TICK_INTERVAL_MS,
	hashToken,
	initialAudit,
	initialRuntime,
	initialSettings,
	MAX_AUDIT_ENTRIES,
	MAX_TICK_IDS,
	newToken,
	type PersonalAudit,
	PersonalAuditDoc,
	type PersonalAuditEntry,
	type PersonalRuntime,
	PersonalRuntimeDoc,
	type PersonalSettings,
	PersonalSettingsDoc,
	pushAuditEntry,
	pushTickId,
	verifyToken,
} from "./docs.ts";
export { type OpenPersonalAgentOptions, openPersonalAgent, type PersonalAgentHandle } from "./harness.ts";
export { PersonalRuntimeExtension, type SchedulerInput, type SchedulerState, SchedulerTask } from "./scheduler.ts";
export { type ConsoleState, createWebApp, type WebAppOptions } from "./web.ts";

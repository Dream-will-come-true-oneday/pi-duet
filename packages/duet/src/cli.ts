import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ServerType, serve } from "@hono/node-server";
import { hashToken, newToken, PersonalRuntimeDoc, PersonalSettingsDoc } from "./docs.ts";
import { openPersonalAgent } from "./harness.ts";
import { VERSION } from "./index.ts";
import { createWebApp } from "./web.ts";

export const DEFAULT_PORT = 8765;

export function defaultDataDir(): string {
	return join(homedir(), ".pi-duet");
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLoopbackHost(host: string): boolean {
	return LOOPBACK_HOSTS.has(host);
}

export type InitResult = {
	dataDir: string;
	token: string;
	url: string;
};

/** Create (or reuse) a data directory and store a fresh console token hash. The token is printed once by the caller. */
export async function initCommand(options: { dataDir: string; port?: number }): Promise<InitResult> {
	const token = newToken();
	const handle = await openPersonalAgent({ dataDir: options.dataDir });
	try {
		await handle.root.commit(async (tx) => {
			const settings = await tx.doc(PersonalSettingsDoc, handle.root.id);
			settings.tokenHash = hashToken(token);
		}, BACKGROUND_CONTEXT);
	} finally {
		await handle.close();
	}
	return {
		dataDir: options.dataDir,
		token,
		url: `http://127.0.0.1:${options.port ?? DEFAULT_PORT}/?token=${token}`,
	};
}

export type StatusReport = {
	version: string;
	dataDir: string;
	dbPath: string;
	tickCount: number;
	lastTickAt: number | null;
	nextTickAt: number | null;
	schedulerTaskId: number | null;
	tokenConfigured: boolean;
};

/** Read-only report for `pi-duet status`. */
export async function statusCommand(options: { dataDir: string }): Promise<StatusReport> {
	const handle = await openPersonalAgent({ dataDir: options.dataDir, readOnly: true });
	try {
		const [settings, runtime] = await Promise.all([
			handle.harness.snapshot(PersonalSettingsDoc, handle.root.id, BACKGROUND_CONTEXT),
			handle.harness.snapshot(PersonalRuntimeDoc, handle.root.id, BACKGROUND_CONTEXT),
		]);
		return {
			version: VERSION,
			dataDir: options.dataDir,
			dbPath: handle.dbPath,
			tickCount: runtime?.tickCount ?? 0,
			lastTickAt: runtime?.lastTickAt ?? null,
			nextTickAt: runtime?.nextTickAt ?? null,
			schedulerTaskId: runtime?.schedulerTaskId ?? null,
			tokenConfigured: (settings?.tokenHash ?? "") !== "",
		};
	} finally {
		await handle.close();
	}
}

/** Replace the console token; the new token is printed once by the caller. */
export async function tokenResetCommand(options: { dataDir: string }): Promise<{ token: string }> {
	const token = newToken();
	const handle = await openPersonalAgent({ dataDir: options.dataDir });
	try {
		await handle.root.commit(async (tx) => {
			const settings = await tx.doc(PersonalSettingsDoc, handle.root.id);
			settings.tokenHash = hashToken(token);
		}, BACKGROUND_CONTEXT);
	} finally {
		await handle.close();
	}
	return { token };
}

export type ServeHandle = {
	server: ServerType;
	url: string;
	close: () => Promise<void>;
};

/** Start the loopback console and resume the durable scheduler. Rejects non-loopback hosts. */
export async function serveCommand(options: { dataDir: string; port?: number; host?: string }): Promise<ServeHandle> {
	const host = options.host ?? "127.0.0.1";
	if (!isLoopbackHost(host)) {
		throw new Error(`Refusing to bind ${host}: the console is local-only and serves loopback addresses exclusively`);
	}
	const port = options.port ?? DEFAULT_PORT;
	const handle = await openPersonalAgent({ dataDir: options.dataDir });
	const settings = await handle.harness.snapshot(PersonalSettingsDoc, handle.root.id, BACKGROUND_CONTEXT);
	if ((settings?.tokenHash ?? "") === "") {
		await handle.close();
		throw new Error(`No console token configured; run "pi-duet init --data-dir ${options.dataDir}" first`);
	}
	handle.harness.resume();
	const app = createWebApp({
		harness: handle.harness,
		root: handle.root,
		dataDir: handle.dataDir,
		tokenHash: settings?.tokenHash ?? "",
	});
	const server = serve({ fetch: app.fetch, hostname: host, port });
	await new Promise<void>((resolve, reject) => {
		if (server.listening) {
			resolve();
			return;
		}
		server.once("listening", () => resolve());
		server.once("error", (error: Error) => reject(error));
	});
	const boundPort = typeof options.port === "number" && options.port > 0 ? options.port : serverPort(server);
	const close = async (): Promise<void> => {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error === undefined ? resolve() : reject(error)));
		});
		await handle.close();
	};
	return { server, url: `http://${host === "localhost" ? "127.0.0.1" : host}:${boundPort}`, close };
}

function serverPort(server: ServerType): number {
	const address = server.address();
	return typeof address === "object" && address !== null ? address.port : 0;
}

type ParsedArgs = {
	command: string[];
	dataDir: string;
	port: number | undefined;
	host: string | undefined;
};

function parseCliArgs(argv: string[]): ParsedArgs {
	const { positionals, values } = parseArgs({
		args: argv,
		options: {
			"data-dir": { type: "string" },
			port: { type: "string" },
			host: { type: "string" },
		},
		allowPositionals: true,
	});
	const dataDir = typeof values["data-dir"] === "string" ? values["data-dir"] : defaultDataDir();
	const portValue = values.port;
	let port: number | undefined;
	if (typeof portValue === "string" && portValue !== "") {
		port = Number.parseInt(portValue, 10);
		if (!Number.isInteger(port) || port < 0 || port > 65535) {
			throw new Error(`Invalid --port: ${portValue}`);
		}
	}
	const host = typeof values.host === "string" && values.host !== "" ? values.host : undefined;
	return { command: positionals, dataDir, port, host };
}

/** CLI entry: returns a process exit code. `serve` blocks until SIGINT/SIGTERM. */
export async function runCli(argv: string[]): Promise<number> {
	const parsed = parseCliArgs(argv);
	const [name, sub] = parsed.command;
	switch (name) {
		case "init": {
			const result = await initCommand({ dataDir: parsed.dataDir, port: parsed.port });
			process.stdout.write(`data dir: ${result.dataDir}\n`);
			process.stdout.write(`console: ${result.url}\n`);
			process.stdout.write(`token (shown once): ${result.token}\n`);
			return 0;
		}
		case "status": {
			const report = await statusCommand({ dataDir: parsed.dataDir });
			for (const [key, value] of Object.entries(report)) {
				process.stdout.write(`${key}: ${value}\n`);
			}
			return 0;
		}
		case "token": {
			if (sub !== "reset") {
				process.stderr.write("usage: pi-duet token reset [--data-dir <dir>]\n");
				return 2;
			}
			const { token } = await tokenResetCommand({ dataDir: parsed.dataDir });
			process.stdout.write(`token (shown once): ${token}\n`);
			return 0;
		}
		case "serve": {
			const started = await serveCommand({
				dataDir: parsed.dataDir,
				port: parsed.port,
				host: parsed.host,
			});
			process.stdout.write(`listening on ${started.url}\n`);
			let resolveShutdown: () => void = () => {};
			const shutdown = new Promise<void>((resolve) => {
				resolveShutdown = resolve;
			});
			const finish = (): void => {
				started.close().finally(() => resolveShutdown());
			};
			process.once("SIGINT", finish);
			process.once("SIGTERM", finish);
			await shutdown;
			return 0;
		}
		default:
			process.stderr.write(
				`pi-duet ${VERSION}\nusage: pi-duet <init|serve|status|token reset> [--data-dir <dir>] [--port <n>] [--host <loopback>]\n`,
			);
			return 2;
	}
}

const entryUrl = pathToFileURL(process.argv[1] ?? "").href;
if (import.meta.url === entryUrl) {
	runCli(process.argv.slice(2)).then(
		(code) => {
			process.exitCode = code;
		},
		(error: unknown) => {
			process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
			process.exitCode = 1;
		},
	);
}

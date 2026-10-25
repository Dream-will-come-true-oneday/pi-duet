// M1 crash-evidence script: start the console from source, SIGKILL it, restart
// on the same data directory, and assert the durable scheduler resumed with
// zero lost or duplicate ticks. Prints a single JSON line with the measured
// numbers and exits non-zero on any assertion failure.
//
// Usage (from packages/duet):
//   node --conditions=source --import ./scripts/source-resolve.mjs scripts/m1-restart.mjs
// Set M1_KEEP_DATA=1 to keep the temp data directory for inspection.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import net from "node:net";
import { initCommand } from "../src/cli.ts";
import { openPersonalAgent } from "../src/harness.ts";

const INTERVAL_MS = 1000;
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const cliEntry = join(packageRoot, "src", "cli.ts");
const sourceResolve = join(packageRoot, "scripts", "source-resolve.mjs");
let dataDir = "";

function freePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

function spawnServe(port) {
	const child = spawn(
		process.execPath,
		[
			"--conditions=source",
			"--import",
			pathToFileURL(sourceResolve).href,
			cliEntry,
			"serve",
			"--data-dir",
			dataDir,
			"--port",
			String(port),
		],
		{ cwd: packageRoot, stdio: ["ignore", "pipe", "pipe"] },
	);
	child.stderr.on("data", (chunk) => process.stderr.write(`[serve] ${chunk}`));
	return child;
}

function waitForExit(child) {
	return new Promise((resolve) => {
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
}

async function fetchState(port, token) {
	const response = await fetch(`http://127.0.0.1:${port}/api/state`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!response.ok) {
		throw new Error(`state returned ${response.status}`);
	}
	return response.json();
}

async function waitFor(predicate, timeoutMs, label) {
	const deadline = Date.now() + timeoutMs;
	let lastError = new Error("no attempt");
	while (Date.now() < deadline) {
		try {
			const value = await predicate();
			if (value !== undefined && value !== null && value !== false) {
				return value;
			}
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`timed out waiting for ${label}; last error: ${lastError.message}`);
}

async function main() {
	dataDir = await mkdtemp(join(tmpdir(), "m1-restart-"));

	// Prepare in-process: a fast scheduler interval plus a console token.
	const setup = await openPersonalAgent({ dataDir, intervalMs: INTERVAL_MS });
	await setup.close();
	const { token } = await initCommand({ dataDir });

	const port = await freePort();
	let child = spawnServe(port);

	const startedAt = Date.now();
	await waitFor(async () => {
		try {
			await fetchState(port, token);
			return true;
		} catch {
			return undefined;
		}
	}, 20_000, "first /api/state after cold start");
	const coldStartMs = Date.now() - startedAt;

	const killedAtTick = await waitFor(async () => {
		const state = await fetchState(port, token);
		return state.tickCount >= 2 ? state.tickCount : undefined;
	}, 20_000, "two ticks before kill");

	child.kill("SIGKILL");
	const killed = await waitForExit(child);
	if (killed.code === 0 || killed.signal !== "SIGKILL") {
		throw new Error(`expected a hard kill, got code=${killed.code} signal=${killed.signal}`);
	}

	const restartAt = Date.now();
	child = spawnServe(port);
	await waitFor(async () => {
		try {
			await fetchState(port, token);
			return true;
		} catch {
			return undefined;
		}
	}, 20_000, "restart /api/state");
	const postState = await waitFor(async () => {
		const state = await fetchState(port, token);
		return state.tickCount > killedAtTick ? state : undefined;
	}, 20_000, "first tick after restart");
	const recoveryMs = Date.now() - restartAt;

	child.kill();
	await waitForExit(child);

	// tickIds is cumulative, so its own duplicates cover pre-kill and post-restart.
	const duplicateTickIds = postState.tickIds.length - new Set(postState.tickIds).size;
	if (duplicateTickIds !== 0) {
		throw new Error(`duplicate tick ids: ${duplicateTickIds}`);
	}
	if (recoveryMs >= 2 * INTERVAL_MS) {
		throw new Error(`recoveryMs ${recoveryMs} exceeded two intervals (${2 * INTERVAL_MS}ms)`);
	}

	console.log(
		JSON.stringify({
			coldStartMs,
			recoveryMs,
			intervalMs: INTERVAL_MS,
			tickCount: postState.tickCount,
			duplicateTickIds,
			exitAfterKill: { code: killed.code, signal: killed.signal },
		}),
	);
}

await main().catch((error) => {
	console.error(`m1-restart failed: ${error.message}`);
	process.exitCode = 1;
});

if (process.env.M1_KEEP_DATA !== "1" && dataDir !== "") {
	await rm(dataDir, { recursive: true, force: true }).catch(() => {});
}

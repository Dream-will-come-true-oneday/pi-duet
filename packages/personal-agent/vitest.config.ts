import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const aiSrc = fileURLToPath(new URL("../ai/src", import.meta.url));
const telemetrySrc = fileURLToPath(new URL("../telemetry/src", import.meta.url));

// pi-ai publishes no "source" conditions at all and pi-telemetry lacks them
// on its root and testing entries, so those specifiers resolve to never-built
// dist files. Redirect them to source files; chord, pi-durable, and
// pi-codemode resolve via their own "source" conditions like upstream.
function toSourceFile(pkgSrc: string, sub: string): string | null {
	for (const candidate of [join(pkgSrc, `${sub}.ts`), join(pkgSrc, sub, "index.ts")]) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

function redirectSource(source: string): string | null {
	if (source === "@earendil-works/pi-ai") {
		return toSourceFile(aiSrc, "index");
	}
	if (source === "@earendil-works/pi-telemetry") {
		return toSourceFile(telemetrySrc, "index");
	}
	const aiMatch = /^@earendil-works\/pi-ai\/(.+)$/.exec(source);
	if (aiMatch) {
		return toSourceFile(aiSrc, aiMatch[1]);
	}
	const telemetryMatch = /^@earendil-works\/pi-telemetry\/(.+)$/.exec(source);
	if (telemetryMatch) {
		return toSourceFile(telemetrySrc, telemetryMatch[1]);
	}
	return null;
}

const sourceRedirectPlugin: Plugin = {
	name: "personal-agent-source-redirects",
	enforce: "pre",
	resolveId(source) {
		return redirectSource(source);
	},
};

export default defineConfig({
	test: {
		environment: "node",
	},
	plugins: [sourceRedirectPlugin],
	resolve: {
		conditions: ["source"],
	},
	ssr: {
		resolve: {
			conditions: ["source"],
		},
	},
});

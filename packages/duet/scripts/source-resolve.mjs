// Runtime source redirection for `node --conditions=source` runs of this
// package (CLI serve, restart evidence script). pi-ai publishes no "source"
// conditions and pi-telemetry lacks them on its root and testing entries, so
// Node would resolve those specifiers to never-built dist files. Redirect
// them to source files; every other specifier resolves normally.
//
// Usage: node --conditions=source --import ./scripts/source-resolve.mjs src/cli.ts ...
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registerHooks } from "node:module";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = join(packageRoot, "..");

const redirects = new Map([
	["@earendil-works/pi-ai", join(packagesRoot, "ai", "src")],
	["@earendil-works/pi-telemetry", join(packagesRoot, "telemetry", "src")],
]);

function toSourceFile(pkgSrc, sub) {
	for (const candidate of [join(pkgSrc, `${sub}.ts`), join(pkgSrc, sub, "index.ts")]) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

registerHooks({
	resolve(specifier, context, nextResolve) {
		let target = null;
		if (redirects.has(specifier)) {
			target = toSourceFile(redirects.get(specifier), "index");
		} else {
			for (const [prefix, pkgSrc] of redirects) {
				if (specifier.startsWith(`${prefix}/`)) {
					target = toSourceFile(pkgSrc, specifier.slice(prefix.length + 1));
					break;
				}
			}
		}
		if (target !== null) {
			return {
				url: pathToFileURL(target).href,
				shortCircuit: true,
				format: "module-typescript",
			};
		}
		return nextResolve(specifier, context);
	},
});

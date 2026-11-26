/**
 * THE SHARED BROWSER-CERTIFICATION HARNESS.
 *
 * Bundles a fixture that imports the REAL components with esbuild, injects the REAL runtime
 * stylesheets, and serves the result through `setContent`. No server, no tenant, no Supabase, no
 * network — a fixture that needed any of those would be certifying the environment, not the code.
 *
 * Both geometry specs load through here so neither can drift into its own idea of what "the real
 * implementation" means.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

// `__dirname`, not `import.meta.url`: this package is CommonJS and Playwright's TypeScript
// transform emits `require`, which an ESM-detected module cannot host.
export const webRoot = resolve(__dirname, "../..");

const bundles = new Map<string, string>();

/** Bundle a fixture — and with it the real component graph — once per worker, per entry. */
export async function bundleFixture(entryFile: string): Promise<string> {
    const cached = bundles.get(entryFile);
    if (cached) return cached;
    // Dynamic: a static import of esbuild is transpiled to `require`, which is not available here.
    const esbuild = await import("esbuild");
    const built = await esbuild.build({
        entryPoints: [resolve(__dirname, entryFile)],
        bundle: true,
        write: false,
        format: "iife",
        jsx: "automatic",
        absWorkingDir: webRoot,
        // `@/…` resolves to the web root exactly as Next and vitest resolve it, so the module graph
        // under test is the shipped one.
        // `crypto` is a node builtin a browser bundle cannot resolve. It reaches these graphs only
        // through an authoring helper no fixture calls — see `nodeCryptoShim.ts`. Aliasing it keeps
        // the real component graph importable; it is inert for any fixture that never touches it.
        alias: { "@": webRoot, crypto: resolve(__dirname, "nodeCryptoShim.ts") },
        nodePaths: [resolve(webRoot, "node_modules")],
        define: { "process.env.NODE_ENV": '"development"' },
        loader: { ".css": "empty" },
        logLevel: "silent",
    });
    const text = built.outputFiles![0].text;
    bundles.set(entryFile, text);
    return text;
}

/** The REAL stylesheets. Every rule under certification lives in one of these, not in the spec. */
const css = (rel: string) => readFileSync(resolve(webRoot, rel), "utf8");

export async function pageHtml(entryFile: string, stylesheets: string[]): Promise<string> {
    const bundle = await bundleFixture(entryFile);
    return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;font:14px system-ui,sans-serif}
#root{width:100%}
${stylesheets.map(css).join("\n")}
</style></head><body>
<script>
// process is a node global a browser bundle does not have. esbuild's define replaces only the exact
// member expressions it is told about, so a component graph that reads process.env any other way
// throws "process is not defined" at mount. Shimming it here keeps the graph under certification the
// SHIPPED one, rather than trimming the fixture until it stops reaching for it.
window.process = window.process || { env: { NODE_ENV: "development" } };
// Instrumented before the bundle runs, so every observation the engine reacts to is counted.
window.__obs = { resize: 0, mutation: 0 };
(function () {
  var RO = window.ResizeObserver;
  window.ResizeObserver = function (cb) { return new RO(function () { window.__obs.resize++; return cb.apply(this, arguments); }); };
  var MO = window.MutationObserver;
  window.MutationObserver = function (cb) { return new MO(function () { window.__obs.mutation++; return cb.apply(this, arguments); }); };
})();
</script>
<div id="root"></div>
<script>${bundle.replace(/<\/script>/g, "<\\/script>")}</script>
</body></html>`;
}

/** Load a fixture at a viewport width, failing loudly on a page error rather than on a symptom. */
export async function loadFixture(
    page: Page,
    entryFile: string,
    stylesheets: string[],
    width: number,
): Promise<string[]> {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.setViewportSize({ width, height: 1200 });
    await page.setContent(await pageHtml(entryFile, stylesheets), { waitUntil: "load" });
    return errors;
}

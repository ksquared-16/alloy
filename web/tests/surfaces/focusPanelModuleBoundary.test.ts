/**
 * CONTRACTS MAY CROSS TO THE BROWSER. SERVER IMPLEMENTATIONS MAY NOT.
 *
 * This defect class has shipped TWICE, and both times every required check was green while the
 * Focus Panel rendered nothing:
 *
 *   1. `import "server-only"` added to `focusPanelOperationalProjection`, a module reached from
 *      graphs the client also imports.
 *   2. `focusPanelCardProducers` importing `buildAttendanceCardVM` (server-only, correctly — it
 *      queries supabase) as a VALUE, beneath `workUnitProvisioningAnswer`, whose `ProvisioningAnswer`
 *      type the browser imports.
 *
 * The second is the subtle one, and it is why this file exists rather than a grep. `import type` at
 * the call site is erased by TypeScript, so the *client's* import looks clean — but the bundler
 * still resolves the value graph rooted through that module, evaluates a `server-only` file, and
 * fails to parse. The poisoning is TRANSITIVE and invisible at every individual import site.
 *
 * ── HOW THIS PROVES IT ──
 *
 * esbuild resolves each browser-importable entry exactly as the bundler does and reports every file
 * it actually reached (`metafile.inputs`). That list IS the module graph. Any `server-only` module
 * in it is the defect, however many hops away it sits.
 *
 * A `not.toContain("server-only")` over source text cannot see past one file and would have passed
 * on both shipped failures.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../..");

/**
 * Modules the browser imports — directly, or for their TYPES, which is enough.
 *
 * `workUnitProvisioningAnswer` is the one that bit us: client components name `ProvisioningAnswer`
 * from it, so its value graph must stay browser-safe even though nothing calls its functions.
 */
const BROWSER_IMPORTABLE_CONTRACTS = [
    "lib/runtime/provisioning/workUnitProvisioningAnswer.ts",
    "lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract.ts",
    "lib/adminV2/runtime/focusPanel/focusPanelOperationalProjection.ts",
    "lib/adminV2/runtime/operationalContext/types.ts",
    "lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts",
    "lib/adminV2/viewModel/drawer/types.ts",
] as const;

/**
 * The client components themselves — the graph Next actually ships to the browser.
 *
 * The contract entries above cover the module that bit us; these cover the consumers, so a
 * server-only edge introduced anywhere a card reaches is caught at the card rather than only at the
 * contract it happens to travel through.
 */
const BROWSER_CARD_OWNERS = [
    "components/admin/focusPanel/cards/BusinessProcessCard.tsx",
    "components/admin/focusPanel/cards/CurrentWorkCard.tsx",
    "components/admin/focusPanel/cards/AttendanceCard.tsx",
    "components/admin/focusPanel/cards/HealthSafetyCard.tsx",
    "components/admin/focusPanel/cards/FinancialsCard.tsx",
    "components/admin/focusPanel/FocusPanelCardGrid.tsx",
] as const;

/** A module that declares itself server-only. The marker is the whole point. */
function declaresServerOnly(absolutePath: string): boolean {
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(absolutePath)) return false;
    try {
        // Only the head: the marker is a side-effect import at the top, and the word appears in
        // prose further down in several of these files (including this one's own subject matter).
        return /^\s*import\s+["']server-only["']/m.test(readFileSync(absolutePath, "utf8").slice(0, 4000));
    } catch {
        return false;
    }
}

/**
 * Every file the bundler actually reaches from an entry. The resolved graph, not the source text.
 */
async function resolvedModuleGraph(entry: string): Promise<string[]> {
    const esbuild = await import("esbuild");
    const built = await esbuild.build({
        entryPoints: [resolve(webRoot, entry)],
        bundle: true,
        write: false,
        metafile: true,
        format: "esm",
        // The browser's resolution rules, which is the question being asked.
        platform: "browser",
        absWorkingDir: webRoot,
        alias: { "@": webRoot },
        nodePaths: [resolve(webRoot, "node_modules")],
        define: { "process.env.NODE_ENV": '"production"' },
        loader: { ".css": "empty" },
        // Third-party packages are not the boundary under test, and resolving all of them is slow.
        packages: "external",
        logLevel: "silent",
    });
    return Object.keys(built.metafile!.inputs).map((p) => resolve(webRoot, p));
}

describe("the browser-importable contract graph reaches no server implementation", () => {
    for (const entry of BROWSER_IMPORTABLE_CONTRACTS) {
        it(`${entry}`, async () => {
            const graph = await resolvedModuleGraph(entry);
            const serverOnly = graph.filter(declaresServerOnly).map((p) => p.replace(`${webRoot}/`, ""));
            expect(
                serverOnly,
                `${entry} reaches server-only module(s) through its VALUE graph.\n` +
                    `A client \`import type\` does not make this safe — the bundler still resolves it,\n` +
                    `evaluates the server-only file, and the surface fails to parse at runtime.\n` +
                    `Move the execution above the contract boundary (see composeProvisioningAnswerForRoute).`,
            ).toEqual([]);
        }, 120_000);
    }

    for (const entry of BROWSER_CARD_OWNERS) {
        it(`${entry}`, async () => {
            const graph = await resolvedModuleGraph(entry);
            const serverOnly = graph.filter(declaresServerOnly).map((p) => p.replace(`${webRoot}/`, ""));
            expect(
                serverOnly,
                `${entry} reaches server-only module(s). A card's graph is shipped to the browser\n` +
                    `verbatim; anything server-only in it fails to evaluate and the surface renders nothing.`,
            ).toEqual([]);
        }, 120_000);
    }

    it("resolves a real graph, so an empty result is a fact rather than a no-op", async () => {
        // A certification that silently resolved nothing would pass forever.
        const graph = await resolvedModuleGraph(BROWSER_IMPORTABLE_CONTRACTS[0]);
        expect(graph.length).toBeGreaterThan(20);
    }, 120_000);

    it("DETECTS a server-only module when one is genuinely in the graph", async () => {
        /*
         * THE BINDING CONTROL, run for real rather than asserted.
         *
         * `composeProvisioningAnswerForRoute` is server-only by design and imports the producers,
         * so its graph MUST trip the detector. If this ever comes back empty the check above has
         * stopped meaning anything — which is exactly how the two shipped defects stayed invisible.
         */
        const graph = await resolvedModuleGraph("lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts");
        expect(graph.filter(declaresServerOnly).length).toBeGreaterThan(0);
    }, 120_000);
});

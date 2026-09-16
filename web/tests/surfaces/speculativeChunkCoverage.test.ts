/**
 * THE HARNESS'S CHUNK LIST MUST MATCH THE DISPATCHER'S ACTUAL IMPORTS.
 *
 * `settleSpeculativeChunks` resolves the chunks `warmCurrentWorkCapabilities` preloads, so a card
 * mount leaves nothing in flight when vitest tears the environment down. That repair is only as
 * good as its list: a warm target added to the dispatcher and not to the harness restores the race
 * exactly as it was — intermittently, on an unrelated branch, naming a module nobody touched.
 *
 * So the list is not maintained by memory. This reads the dispatcher's source and requires every
 * literal `import("…")` in it to have an entry. It fails LOUDLY and deterministically at the moment
 * the target is added, rather than flakily weeks later.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SPECULATIVE_CHUNK_IMPORTERS } from "./settleSpeculativeChunks";

const DISPATCHER = "lib/adminV2/runtime/focusPanel/currentWork/warmCurrentWorkCapabilities.ts";

describe("speculative chunk coverage", () => {
    const source = readFileSync(resolve(__dirname, "../..", DISPATCHER), "utf8");

    it("every chunk the warm dispatcher preloads is settled by the harness", () => {
        const specifiers = [...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]!);

        // Both ends must be non-trivial, or an empty result would pass forever.
        expect(specifiers.length, `no dynamic imports found in ${DISPATCHER} — the parse is broken`).toBeGreaterThan(0);

        expect(
            [...new Set(specifiers)].sort(),
            "a chunk the warm dispatcher preloads is NOT settled by the harness. Add it to "
                + "SPECULATIVE_CHUNK_IMPORTERS, or the Focus Panel certification will start failing "
                + "intermittently with EnvironmentTeardownError naming a module nobody imported.",
        ).toEqual(Object.keys(SPECULATIVE_CHUNK_IMPORTERS).sort());
    });

    it("refuses a non-literal import specifier, which this guard could not follow", () => {
        /*
         * A computed `import(someVariable)` cannot be matched statically, so it would pass the check
         * above while still racing teardown. If one is ever introduced, the parse must stop being
         * trusted rather than quietly under-report.
         */
        const nonLiteral = /import\(\s*(?!["'])[^)]*\)/.exec(source.replace(/\/\*[\s\S]*?\*\//g, ""));
        expect(
            nonLiteral?.[0] ?? null,
            "the warm dispatcher gained a computed dynamic import; the coverage guard can no longer "
                + "enumerate its chunks by reading the source.",
        ).toBeNull();
    });
});

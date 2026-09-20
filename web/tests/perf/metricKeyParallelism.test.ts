/**
 * METRIC KEYS RESOLVE CONCURRENTLY.
 *
 * Measured on the canonical Work Unit header request (deployed, warm, 6 reps, one session):
 * the authorization floor is 266ms; the three keys cost 838 / 230 / 200ms of metric work
 * individually but 1,041ms combined, against a parallel floor of ~838ms — the slowest key. The
 * serial edge was worth ~200ms and nothing required it.
 *
 * These gates hold the two things that could go wrong: losing the concurrency again, and silently
 * changing what a key failure means.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ENGINE = codeOf(read("lib/metrics/metricEngine.ts"));

/** The body of resolveMetrics only — a `for await` elsewhere in the engine is not this contract. */
const RESOLVE = (() => {
    // Bounded by brace depth: `indexOf("\n}")` stopped at the first nested closer, so the slice
    // held only the signature and every gate below asserted against an empty-ish string.
    const start = ENGINE.indexOf("export async function resolveMetrics(");
    // Start at the BODY's brace. The first `{` after the name opens the params OBJECT TYPE, so
    // counting from there closed on the signature and the slice held no statements at all.
    const bodyStart = ENGINE.indexOf("> {", start);
    let depth = 0;
    for (let i = ENGINE.indexOf("{", bodyStart); i < ENGINE.length; i++) {
        if (ENGINE[i] === "{") depth++;
        else if (ENGINE[i] === "}") {
            depth--;
            if (depth === 0) return ENGINE.slice(start, i + 1);
        }
    }
    return "";
})();

describe("metric key execution", () => {
    it("keys resolve concurrently, not in a serial await loop", () => {
        expect(RESOLVE.length).toBeGreaterThan(0);
        expect(RESOLVE).toContain("Promise.all(");
        expect(RESOLVE).toContain("keys.map(");
    });

    it("no per-key sequential await survives in resolveMetrics", () => {
        // `for (const key of keys) { await ... }` is the exact edge this removed.
        expect(RESOLVE).not.toMatch(/for\s*\(\s*const\s+\w+\s+of\s+keys\s*\)/);
    });

    it("result order still follows the requested key order", () => {
        // Some call sites index by position; concurrency must not reorder the answer.
        expect(RESOLVE).toMatch(/Promise\.all\(\s*\n?\s*keys\.map\(/);
        expect(RESOLVE).not.toContain("results.push(");
    });

    it("per-key failure semantics are UNCHANGED", () => {
        /*
         * The sequential loop propagated a thrown key and failed the request. `Promise.all`
         * preserves exactly that. `allSettled` would be a different contract — arguably better,
         * but changing it silently while changing scheduling would hide a semantic change inside
         * a performance commit.
         */
        expect(RESOLVE).toContain("Promise.all(");
        expect(RESOLVE).not.toContain("Promise.allSettled(");
    });

    it("the KPI evaluation stays per-metric and pure inside the mapped unit", () => {
        expect(RESOLVE).toMatch(/keys\.map\([\s\S]*?evaluateKpiForMetric\(\{ kpiKey, metric, orgMetadata \}\)/);
    });
});

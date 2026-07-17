import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Layer-separation guardrail (Phase 6).
 *
 * The platform keeps three operational layers strictly separate:
 *   - Operational Calculations  (truth runtime)   — lib/childcareOperational/*
 *   - Operational Intelligence   (analytics)       — lib/analytics/*, lib/metrics/*
 *   - Operational Expectations   (evaluation)      — lib/operationalExpectations/*  [FROZEN]
 *
 * A calculation measures what IS; it never asserts what SHOULD be. The physical
 * meaning of "keep the Operational Expectations boundary frozen" is: the truth
 * runtime and the analytics calculation registry introduce NO import edge into
 * the frozen authored ledger. This test fails the moment such an edge appears.
 */

const ROOT = join(__dirname, "..", "..", "..");

// Matches an import/re-export from the authored expectations ledger, e.g.
//   from "@/lib/operationalExpectations/..."   (NOT the local childcareOperational/expectations folder)
const AUTHORED_LEDGER_IMPORT = /from\s+["'](?:@\/lib|(?:\.\.?\/)+)operationalExpectations(?:\/[^"']*)?["']/;

// The new scheduling family must also stay off the analytics/OIP scalar registry.
const ANALYTICS_CALC_IMPORT = /from\s+["'](?:@\/lib|(?:\.\.?\/)+)analytics\/calculations(?:\/[^"']*)?["']/;

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(entry)) {
            out.push(full);
        }
    }
    return out;
}

function offenders(relRoots: readonly string[], pattern: RegExp): string[] {
    const hits: string[] = [];
    for (const rel of relRoots) {
        for (const file of walk(join(ROOT, rel))) {
            if (pattern.test(readFileSync(file, "utf8"))) {
                hits.push(file.slice(ROOT.length + 1));
            }
        }
    }
    return hits;
}

describe("operational layer boundaries", () => {
    it("the truth runtime never imports the frozen Operational Expectations ledger", () => {
        expect(offenders(["lib/childcareOperational"], AUTHORED_LEDGER_IMPORT)).toEqual([]);
    });

    it("the analytics calculation registry never imports the frozen Operational Expectations ledger", () => {
        expect(offenders(["lib/analytics/calculations"], AUTHORED_LEDGER_IMPORT)).toEqual([]);
    });

    it("the scheduling calculation family never imports the analytics/OIP scalar registry", () => {
        expect(offenders(["lib/childcareOperational/calculations"], ANALYTICS_CALC_IMPORT)).toEqual([]);
    });
});

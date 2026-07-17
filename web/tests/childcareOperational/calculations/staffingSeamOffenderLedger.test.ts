import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Staffing-seam offender ledger (Phase 6, Step 4 — the "PR #184 technique").
 *
 * Doctrine: a consumer never re-derives a fact. Required-staff must resolve through
 * the canonical Ratio surface (`capacity/resolveRatio`), never the raw tier
 * primitive `config/ratioRules#requiredStaffForChildren`.
 *
 * This ledger enumerates the ONLY sanctioned call sites of that primitive and
 * asserts no others exist. Two sites are legitimate and permanent:
 *   - config/ratioRules.ts       — the primitive's own definition module
 *   - capacity/resolveRatio.ts   — the canonical surface that wraps it
 *
 * The allowlist starts (and, post-convergence, stays) with no consumers. Any new
 * production file that calls the primitive directly fails this test — it must go
 * through the canonical surface instead. The list may shrink, never grow.
 */

const ROOT = join(__dirname, "..", "..", "..");

const SANCTIONED = new Set<string>([
    "lib/childcareOperational/config/ratioRules.ts", // definition
    "lib/childcareOperational/capacity/resolveRatio.ts", // canonical surface
]);

// Known consumers still bypassing the canonical surface. Must be empty; may shrink.
const KNOWN_OFFENDERS: readonly string[] = [];

const CALLS_PRIMITIVE = /\brequiredStaffForChildren\s*\(/;

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
            out.push(full);
        }
    }
    return out;
}

describe("staffing seam offender ledger", () => {
    it("no production consumer calls the ratio primitive directly (canonical surface only)", () => {
        const offenders: string[] = [];
        for (const dir of ["lib", "app", "components"]) {
            for (const file of walk(join(ROOT, dir))) {
                const rel = file.slice(ROOT.length + 1);
                if (SANCTIONED.has(rel)) continue;
                if (CALLS_PRIMITIVE.test(readFileSync(file, "utf8"))) offenders.push(rel);
            }
        }
        expect(offenders.sort()).toEqual([...KNOWN_OFFENDERS].sort());
    });
});

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactDir = path.join(repoRoot, "docs/audits/active/api-platform-thread3");
const artifactPath = path.join(artifactDir, "route-classification.json");
const generatorPath = path.join(artifactDir, "build-route-classification.mjs");

type Row = {
    apiPath: string;
    classification: string;
    externalReady: boolean;
    externalReadyChecks: Record<string, boolean>;
};

const rows = (): Row[] => JSON.parse(readFileSync(artifactPath, "utf8")) as Row[];

/**
 * Thread 3 measured Alloy's API estate and concluded that none of it is externally ready.
 * These assertions keep that measurement honest: they fail if the artifact stops reconciling
 * with the live route tree, if the generator stops being deterministic, or — most importantly —
 * if a route starts claiming external readiness without passing every gate.
 *
 * This is a measurement lock, not a security assertion. It stays green when the defects in
 * `security-defect-register.md` are repaired.
 */
describe("API estate classification (Thread 3)", () => {
    it("accounts for every live route file exactly once", () => {
        const live = execFileSync("bash", ["-lc", `find "${repoRoot}/web/app/api" -name route.ts | wc -l`])
            .toString()
            .trim();
        expect(rows()).toHaveLength(Number(live));
    });

    it("classifies every route, with no route left unlabelled", () => {
        const all = rows();
        expect(all.every((r) => typeof r.classification === "string" && r.classification.length > 0)).toBe(true);
        const total = Object.values(
            all.reduce<Record<string, number>>((acc, r) => {
                acc[r.classification] = (acc[r.classification] ?? 0) + 1;
                return acc;
            }, {}),
        ).reduce((a, b) => a + b, 0);
        expect(total).toBe(all.length);
    });

    it("reports no route as EXTERNAL_READY", () => {
        // Authentication alone never qualifies. A route must carry a non-session credential,
        // derive its org from that credential, validate its input, appear in the machine
        // contract, and have an idempotency story if it mutates.
        expect(rows().filter((r) => r.externalReady).map((r) => r.apiPath)).toEqual([]);
    });

    it("never marks a route externally ready while any gate fails", () => {
        for (const r of rows()) {
            if (!r.externalReady) continue;
            expect(Object.values(r.externalReadyChecks).every(Boolean)).toBe(true);
        }
    });

    it("regenerates byte-identically", () => {
        const out = path.join(mkdtempSync(path.join(tmpdir(), "alloy-api-estate-")), "regen.json");
        execFileSync("node", [generatorPath, out], { cwd: repoRoot });
        expect(readFileSync(out, "utf8")).toBe(readFileSync(artifactPath, "utf8"));
    });
});

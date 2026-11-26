/**
 * R13 — the shared sub-tab DOM contract has exactly one name across the repository.
 *
 * A rename that leaves a stale selector behind is worse than no rename: the consumer keeps passing
 * until the surface it targets happens to be on screen. This sweeps the source tree rather than
 * trusting the migration, and it deliberately distinguishes the two attributes that share a prefix:
 *
 *   `data-workspace-section-tab`  — the SHARED Layer-1 primitive (Communications, Operations,
 *                                   Digital Mailroom, Work Items, Scheduling)
 *   `data-comms-tab-panel`        — genuinely Communications-owned, one emitter, and untouched
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const REPO = resolve(__dirname, "../../..");

/**
 * The R13 evidence itself names the old attribute — on purpose, to assert that it is gone. A sweep
 * that counted those would flag its own proof and, worse, would pass only until someone wrote another
 * absence check. They are excluded by exact path so the exclusion stays visible and small.
 */
const ABSENCE_EVIDENCE = [
    "web/tests/workspace/workspaceSectionTabContractSweep.test.ts",   // this file
    "web/tests/workspace/workspaceSubTabsCoexistence.test.tsx",       // asserts the old name renders 0 times
    "web/scripts/r13SectionTabs.mjs",                                 // counts old vs new to catch a partial migration
];

/**
 * Tracked CODE only. Documentation deliberately records the old name as resolved history (the
 * convergence matrix explains what was renamed and why), so prose is out of scope for this sweep.
 */
function grepTracked(pattern: string): string[] {
    let out: string[];
    try {
        out = execFileSync("git", ["grep", "-l", "-E", pattern, "--", ".", ":!*/node_modules/*", ":!*.md"], {
            cwd: REPO,
            encoding: "utf8",
        })
            .split("\n")
            .filter(Boolean);
    } catch {
        return []; // git grep exits non-zero when there are no matches
    }
    return out.filter((f) => !ABSENCE_EVIDENCE.includes(f));
}

describe("R13 — one canonical name for the shared sub-tab contract", () => {
    it("12: no tracked file still uses the old shared attribute", () => {
        // Negative lookahead: `data-comms-tab-panel` is a different, still-valid attribute.
        expect(grepTracked("data-comms-tab([^-]|$)")).toEqual([]);
    });

    it("12: no tracked file still uses the old shared tablist attribute", () => {
        expect(grepTracked("data-comms-modal-tabs")).toEqual([]);
    });

    it("8: no runtime consumer references the old dataset property", () => {
        expect(grepTracked("commsTab")).toEqual([]);
    });

    it("the Communications-owned panel attribute is deliberately preserved", () => {
        // Renaming this would be renaming an unrelated Communications concept.
        expect(grepTracked("data-comms-tab-panel").length).toBeGreaterThan(0);
    });

    it("the exclusion list names only files that exist to assert the old name's absence", () => {
        // Guards the guard: if one of these stops mentioning the old name, drop it from the list
        // rather than leaving a silent hole in the sweep.
        for (const f of ABSENCE_EVIDENCE) {
            const raw = execFileSync("git", ["show", `HEAD:${f}`], { cwd: REPO, encoding: "utf8" });
            expect(raw).toMatch(/data-comms-tab|commsTab/);
        }
    });

    it("no file emits the old attribute (emission is the contract that matters)", () => {
        const emitters = grepTracked("data-comms-tab=");
        expect(emitters).toEqual([]);
    });

    it("the shared primitive is the only emitter of the canonical attribute", () => {
        const emitters = grepTracked("data-workspace-section-tab=\\{").filter((f) => f.endsWith(".tsx"));
        expect(emitters).toEqual(["web/app/adminV2/communications/CommsModalTabBar.tsx"]);
    });
});

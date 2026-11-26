import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
    beginWorkUnitPrimaryReveal,
    endWorkUnitPrimaryReveal,
    isWorkUnitPrimaryRevealActive,
    resetDrawerVmPrewarmSchedulerForTests,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";
import { provisioningAnswerUrl } from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

/**
 * Runtime invariants earned by the Grade A performance program. Each one here is a REGRESSION that
 * actually happened and cost multi-second operator latency — not a hypothetical.
 */

describe("LAW 6 — the primary reveal gate may never remain permanently armed", () => {
    beforeEach(() => resetDrawerVmPrewarmSchedulerForTests());

    it("releases when the reveal ends", () => {
        beginWorkUnitPrimaryReveal();
        expect(isWorkUnitPrimaryRevealActive()).toBe(true);
        endWorkUnitPrimaryReveal();
        expect(isWorkUnitPrimaryRevealActive()).toBe(false);
    });

    it("a single end releases the gate no matter how many begins preceded it", () => {
        // The observed production failure: repeated `begin` (one per child switch) with an `end`
        // that never ran, leaving the gate armed forever and silently suppressing ALL subject
        // preparation. A gate that needs N ends for N begins can strand itself the same way.
        beginWorkUnitPrimaryReveal();
        beginWorkUnitPrimaryReveal();
        beginWorkUnitPrimaryReveal();
        endWorkUnitPrimaryReveal();
        expect(isWorkUnitPrimaryRevealActive()).toBe(false);
    });
});

describe("LAW 6 — the reveal window is armed per WORK UNIT, not per subject", () => {
    it("the commit-time arm does not key on the attention subject", () => {
        const src = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
        const arm = src.slice(src.indexOf("const committedRevealKey"), src.indexOf("const committedRevealKey") + 400);
        // Keying on `target::subject` re-armed on every child switch while the paired `end` lived in
        // the family record runtime, which never re-runs for a same-family child. The gate stuck on.
        expect(arm).not.toMatch(/ref\.target[^\n]*ref\.subject/);
        expect(arm).toContain("ref.target");
    });
});

describe("LAW 7 — readiness uses the SAME canonical resource owner as demand loading", () => {
    it("the prefetch URL is the demand URL, keyed identically", () => {
        expect(provisioningAnswerUrl("waitlist")).toBe("/api/admin/work-units/waitlist/provisioning-answer");
        expect(provisioningAnswerUrl("waitlist", "view_2")).toContain("work_view_id=view_2");
        expect(provisioningAnswerUrl("waitlist", null, "subject-1")).toContain("subject_id=subject-1");
    });

    it("a contextual (cohort-free) answer keys differently from an operational one", () => {
        // Sharing a key would let a warm operational answer serve a contextual entry, or the reverse.
        expect(provisioningAnswerUrl("wu", "lens", "subj")).not.toBe(
            provisioningAnswerUrl("wu", "lens", "subj", "none"),
        );
    });
});

describe("LAW 8 — Workspace readiness prepares the destinations the operator clicks", () => {
    it("the readiness set includes Work View hrefs, not only process entry hrefs", () => {
        const src = read("lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts");
        const block = src.slice(src.indexOf("const processEntryHrefs"), src.indexOf("const processEntryHrefs") + 1200);
        // A Workspace with ONE process and several Work View rows yielded a single href, so the idle
        // block returned early and only the process default (0 rows) was ever prepared.
        expect(block).toContain("workViews");
        expect(block).toMatch(/slice\(0,\s*WORKSPACE_READINESS_DESTINATION_CAP\)/);
    });

    it("readiness stays bounded", () => {
        const src = read("lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts");
        expect(src).toMatch(/const WORKSPACE_READINESS_DESTINATION_CAP = \d+;/);
    });
});

describe("LAW 10 — queue subject preparation follows LIVE attention", () => {
    it("the adjacency window anchors on attention, not the shared settlement anchor", () => {
        const src = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
        const block = src.slice(src.indexOf("const adjacentSubjectIds"), src.indexOf("const adjacentSubjectIds") + 900);
        // Every child row shares one `drawer_open.entity_id` (the family), so anchoring on the
        // settlement subject pinned the window to row 0 and never followed the operator.
        expect(block).toContain("attentionSubjectForWindow");
        expect(src).toMatch(/useAttentionSubject\(\)/);
    });
});

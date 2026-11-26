/**
 * The opportunity drawer reads the family's persisted stage.
 *
 * `sharedCanonicalDeps` takes the family stage from the opportunity row (`oppRow.stage_key`) for the
 * Mission, the lifecycle rail and — through the composed record — the Children card's family-stage
 * fallback. The select it reads with did not carry the column, so every family read as stageless and
 * fell back to its status: a family at Tour (status still `new`) showed Lead on the stepper, Lead's
 * work, and "New Lead" on each child.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { OPPORTUNITY_CANONICAL_ADMIN_SELECT } from "@/lib/fields/canonicalEntitySelectColumns";

const columns = OPPORTUNITY_CANONICAL_ADMIN_SELECT.split(",").map((c) => c.trim());

describe("the drawer's opportunity read carries the family stage", () => {
    it("selects stage_key as a column of its own", () => {
        expect(columns).toContain("stage_key");
    });

    it("names no stage column opportunities does not have", () => {
        expect(columns).not.toContain("lifecycle_stage_key");
    });

    it("hands the persisted stage to the lifecycle rail", () => {
        const src = readFileSync("lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps.ts", "utf8");
        const railCall = src.slice(src.indexOf("buildOpportunityWorkspaceLifecycleRail({"));
        expect(railCall.slice(0, 400)).toMatch(/stageKey:\s*trimOrNull\(\(oppRow as Record<string, unknown>\)\.stage_key\)/);
    });
});

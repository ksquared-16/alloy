/** Source guards for the deferred stage-work (Tier-2) wiring — one owner, no false-empty, no comms on intent. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const web = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

describe("stage-work Tier-2 wiring", () => {
    it("the workspace VM route defers stage work (and comms) by default", () => {
        const route = read("app/api/admin/view-models/drawer/opportunity/[id]/route.ts");
        expect(route).toMatch(/deferStageWork:\s*sp\.get\("stage_work"\)\s*!==\s*"1"/);
        expect(route).toMatch(/deferCommunicationsPreview:\s*sp\.get\("comms_preview"\)\s*!==\s*"1"/);
    });

    it("compose emits a stage_work load state and skips the projection when deferred", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toContain("deferStageWork");
        expect(compose).toContain("stage_work: stage_work_state");
        expect(compose).toContain("resolveOpportunityStageWorkSlice");
        // Deferred path marks pending, never a fabricated runtime.
        expect(compose).toMatch(/deferStageWork\s*\?\s*\{\s*status:\s*"pending"\s*\}/);
    });

    it("the thin stage-work route is NOT a second full composition", () => {
        const route = read("app/api/admin/view-models/drawer/opportunity/[id]/stage-work/route.ts");
        expect(route).toContain("resolveOpportunityStageWorkSlice");
        expect(route).not.toContain("composeOpportunityDrawerViewModel");
    });

    it("row intent warms the stage-work resource with the VM's real stage key — never comms threads", () => {
        const warm = read("lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm.ts");
        expect(warm).toContain("prefetchOpportunityStageWork");
        expect(warm).toContain("current_stage_key");
        // Row-intent warm must not pull communications threads / family workspace.
        expect(warm).not.toMatch(/prefetchDrawerFamilyWorkspace|inboxWarmLoad|communications\/family-workspace/);
    });

    it("Current Work card renders the pending treatment BEFORE the empty state (no false 'No active work')", () => {
        const card = read("components/admin/focusPanel/cards/CurrentWorkCard.tsx");
        expect(card).toContain("stageWorkPending");
        expect(card).toContain("Loading What's Next");
        // In each presentation the pending JSX (data-work-pending) precedes the empty JSX
        // (data-work-empty) — using the unambiguous render markers, not prose.
        const firstPendingMark = card.indexOf('data-work-pending="true"');
        const firstEmptyMark = card.indexOf('data-work-empty="true"');
        expect(firstPendingMark).toBeGreaterThan(-1);
        expect(firstEmptyMark).toBeGreaterThan(-1);
        expect(firstPendingMark).toBeLessThan(firstEmptyMark);
    });

    it("buildOperationalContext forwards the pending flag to the Current Work region", () => {
        const ctx = read("lib/adminV2/runtime/operationalContext/buildOperationalContext.ts");
        expect(ctx).toMatch(/stageWorkPending:\s*subjectVm\.workspace\.stage_work\?\.status === "pending"/);
    });
});

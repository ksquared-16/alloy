/** Source guards for the deferred stage-work (Tier-2) wiring — one owner, no false-empty, no comms on intent. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const web = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

describe("stage-work Tier-2 wiring", () => {
    it("the workspace VM route composes stage work INLINE, and still defers comms", () => {
        /*
         * Stage work used to be deferred here. It is not any more, and the reason is measured: every
         * client path derives the stage-work fetch key from `lifecycle_rail.current_stage_key`, so
         * What's Next could not ask for its data until the whole ~124 KB view model had landed — a
         * second round-trip observed 209-2065 ms after the VM. Composing A and B together makes the
         * slice free (181-380 ms hidden inside A's ~650-800 ms), so deferring it only bought a delay.
         *
         * Comms preview stays deferred: the Activity workspace fetches it on demand, so it is not
         * merely late, it is often not needed at all.
         */
        const route = read("app/api/admin/view-models/drawer/opportunity/[id]/route.ts");
        expect(route).toMatch(/deferStageWork:\s*sp\.get\("stage_work"\)\s*===\s*"0"/);
        expect(route).toMatch(/deferCommunicationsPreview:\s*sp\.get\("comms_preview"\)\s*!==\s*"1"/);
    });

    it("A and B are composed CONCURRENTLY — B is never awaited behind A", () => {
        // The whole saving above depends on this: B takes no `record` and reads nothing A produces,
        // so awaiting it after A cost `A + B` for no dependency. If this reverts to a sequential
        // await, inlining stage work starts adding its cost to first paint instead of hiding it.
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toMatch(/const \[initial, deferred\]\s*=\s*await Promise\.all\(\[/);
        expect(compose).not.toMatch(/const deferred\s*=\s*await buildDeferredDetailResource/);
    });

    it("compose emits a stage_work load state and skips the projection when deferred", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toContain("deferStageWork");
        expect(compose).toContain("stage_work: stage_work_state");
        /*
         * PRE-EXISTING STALE ASSERTION, repaired rather than deleted.
         *
         * These two both failed before this change: `resolveOpportunityStageWorkSlice` and the
         * pending ternary moved into `deferredDetailResource.ts` when Module B was extracted, and the
         * guard kept reading compose. A guard that cannot pass is not protecting anything, so it now
         * reads the file that actually owns the projection — the property it was written to protect
         * (deferred marks pending, never a fabricated runtime) is unchanged and still asserted.
         */
        const deferredResource = read("lib/adminV2/viewModel/drawer/opportunity/deferredDetailResource.ts");
        expect(deferredResource).toContain("resolveOpportunityStageWorkSlice");
        expect(deferredResource).toMatch(/deferStageWork\s*\?\s*\{\s*status:\s*"pending"\s*\}/);
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

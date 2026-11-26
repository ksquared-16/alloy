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
        /*
         * `stage_work=0` is RETIRED, so the route no longer reads it at all.
         *
         * It restored the deferred contract, and nothing ever constructed it —
         * `buildOpportunityDrawerViewModelUrl` is the only builder of this query and sets department,
         * work unit and attention subject. The branch was unreachable from the product and fully
         * alive in the code, and the patch it enabled merged stage-work truth without refreshing the
         * operational projection beside it.
         */
        // The READ, not the word: the route's comment explains the retirement and naming it there
        // is the point. What must be gone is the parameter ever reaching the composer.
        expect(route).not.toMatch(/sp\.get\(\s*["']stage_work["']\s*\)/);
        expect(route).not.toMatch(/deferStageWork\s*:/);
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

    it("stage work is resolved by ONE owner and can never be marked pending", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        expect(compose).toContain("stage_work: stage_work_state");
        // The deferral parameter is gone from the composer entirely.
        expect(compose).not.toContain("deferStageWork");

        /*
         * The load state may be `ready` or `empty` — never `pending`.
         *
         * `pending` was the deferred contract's marker, and the client effect that answered it wrote
         * `stage_work_runtime` without touching `operational_projection`. A view model that carried
         * both would describe Current Work and the card envelope from one stage-work runtime beside
         * a later one. Making `pending` unproducible is what retires that, rather than guarding the
         * path that consumed it.
         */
        const deferredResource = read("lib/adminV2/viewModel/drawer/opportunity/deferredDetailResource.ts");
        expect(deferredResource).toContain("resolveOpportunityStageWorkSlice");
        expect(deferredResource).not.toContain("deferStageWork");
        expect(deferredResource).not.toMatch(/status:\s*"pending"/);
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

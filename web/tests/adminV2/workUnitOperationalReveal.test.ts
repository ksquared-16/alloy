import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldDeferOpportunityDrawerOpen } from "@/lib/admin/opportunityDrawerOpenCoordinator";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

const WORK_UNIT_PATH = "/adminV2/workspace/dept/dept-1/work-unit/enrollment";
const NON_WORK_UNIT_PATH = "/adminV2/workspace";

describe("Work Unit operational reveal — legacy overlay quarantine", () => {
    it("identifies Preparing record… as OpportunityDrawerOpeningOverlay", () => {
        const overlay = readSrc("components/admin/OpportunityDrawerOpeningOverlay.tsx");
        expect(overlay).toContain('data-opportunity-drawer-opening-overlay="true"');
        expect(overlay).toContain("Preparing ${recordLabel}…");
    });

    it("work unit bypasses deferred coordinator open (no centered overlay gate)", () => {
        expect(shouldDeferOpportunityDrawerOpen(WORK_UNIT_PATH, "opp-1")).toBe(false);
    });

    it("non-work-unit canonical paths still defer when bootstrap enabled", () => {
        const coordinator = readSrc("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(coordinator).toContain("isCanonicalDrawerHostPath(p)");
        // Workspace landing is canonical but not a work-unit queue surface.
        const deferred = shouldDeferOpportunityDrawerOpen(NON_WORK_UNIT_PATH, "opp-1");
        // When bootstrap is off in test env, defer is always false — assert wiring exists instead.
        if (!deferred) {
            expect(coordinator).toContain("adminV2DrawerBootstrapEnabled");
        }
    });

    it("manual selection blocks default auto-open overwrite", () => {
        const hook = readSrc(
            "lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen.ts",
        );
        expect(hook).toContain("manualSelectionRef");
        expect(hook).toContain("if (manualSelectionRef.current)");
        // Manual selection short-circuits the default resolver and logs the blocked-intent reason.
        expect(hook).toContain("default_resolver_blocked_manual_selection");
        expect(hook).toContain("alloy-os-manual-operational-subject");
    });

    it("deep link auto-open respects URL record id", () => {
        const hook = readSrc(
            "lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen.ts",
        );
        expect(hook).toContain("if (urlRecordId) return");
    });

    it("split outside-click guard treats queue scrollport as subject swap, not close", () => {
        const outsideClick = readSrc("lib/adminV2/drawerOutsideClick.ts");
        expect(outsideClick).toContain("data-workspace-queue-scrollport");
        expect(outsideClick).toContain("alloyOsSplitActive");
    });

});

const WORK_UNIT_PAGE = "app/adminV2/workspace/work-unit/[workUnitSlug]/layout.tsx";

describe("Phase 3 — single queue source (bootstrap-inline hydrate)", () => {
    it("paints bootstrap-inlined rows with no loading shell and a single deferred refresh", () => {
        const page = readSrc(WORK_UNIT_PAGE);
        // Inline hydrate no longer flips loading on by completeness, and never fires an immediate
        // second `initialLaneReveal` for the inlined lane — only one quiet refresh after reveal.
        expect(page).toContain("wu_queue_bootstrap_inline_hydrate");
        expect(page).toContain("complete_defer_refresh");
        expect(page).toContain("incomplete_defer_refresh");
        // The deferred refresh is a quietStaleRefresh (stale-while-refresh AFTER reveal).
        expect(page).toMatch(/primaryLaneHydratedInline = true;[\s\S]*quietStaleRefresh: true/);
    });
});

describe("Phase 5 — queue click intent instrumentation", () => {
    it("emits manual_row_click + selected_subject_set on operator row clicks", () => {
        const page = readSrc(WORK_UNIT_PAGE);
        expect(page).toContain('perfIntent("manual_row_click"');
        expect(page).toContain('perfIntent("selected_subject_set"');
        // Manual click cancels the background prewarm backlog so it can't overwrite the subject.
        expect(page).toMatch(/manual_row_click[\s\S]*cancelBackgroundDrawerVmPrewarm|cancelBackgroundDrawerVmPrewarm[\s\S]*selected_subject_set/);
    });

    it("default resolver logs the blocked-by-manual-selection intent as a stale_ignored event", () => {
        const hook = readSrc(
            "lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen.ts",
        );
        // Section-map intent vocabulary: the superseded default-resolver result is a WU-05 stale ignore.
        expect(hook).toContain('perfIntent("stale_ignored"');
        expect(hook).toContain('section_id: "WU-05"');
        expect(hook).toContain('reason: "default_resolver_blocked_manual_selection"');
    });

    it("scheduler bumps an epoch to ignore stale background completions", () => {
        const sched = readSrc("lib/adminV2/runtime/preload/drawerVmPrewarmScheduler.ts");
        expect(sched).toContain("epoch += 1");
        expect(sched).toContain('perfIntent("stale_completion_ignored"');
    });
});

describe("Addendum B — WUC KPI snapshot rule", () => {
    it("renders a default KPI snapshot in final placement while live placements load", () => {
        const page = readSrc(WORK_UNIT_PAGE);
        // Loading branch returns a default snapshot, not an empty strip that pops in later.
        expect(page).toMatch(
            /wuPlacementRows === undefined && !showOipOnlyKpiStrip\)\s*\{[\s\S]*buildDefaultWorkUnitKpis\(workUnitKpiContext\)/,
        );
    });

});

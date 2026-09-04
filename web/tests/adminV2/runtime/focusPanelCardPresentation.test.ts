import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import {
    deriveOperationalViewsFromQueueDefinition,
    relabelPrimaryPillSectionWorkView,
} from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";
import { operatorOperationalPerspectivesEnabled } from "@/lib/adminV2/runtime/configurationRuntimeConvergenceFlag";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Focus Panel Universal Card presentation", () => {
    const baseVm = minimalSettledOpportunityDrawerViewModel({
        summaries: {
            tasks: { state: "loaded", open_count: 0, open_tasks: [] },
            active_tour_bookings: [], operator_relevant_tour_booking: null,
            reminders: {
                state: "empty",
                next_follow_up_iso: null,
                scheduled_send_count: 0,
                scheduled_sends: [],
            },
            bos: null,
            attention: {
                visible: true,
                needs_attention: true,
                primary_reason: "Missing forms",
                reason_count: 1,
            },
        },
    });

    it("UniversalCard exposes System 5 grammar markers", () => {
        const card = readSrc("components/admin/focusPanel/UniversalCard.tsx");
        expect(card).toContain('data-system5-card="true"');
        expect(card).toContain("supportingInsight");
        expect(card).toContain("UniversalCardIcon");
        const spec = readSrc("lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec.ts");
        expect(spec).toContain("SYSTEM5_CARD_ICON");
        expect(spec).toContain("SYSTEM5_DEFAULT_CARD_ACTIONS");
    });

    it("UniversalCard exposes data-card-role tier vocabulary", () => {
        const card = readSrc("components/admin/focusPanel/UniversalCard.tsx");
        expect(card).toContain('data-card-role={cardRole}');
        const spec = readSrc("lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec.ts");
        expect(spec).toContain('attention: "critical"');
        expect(spec).toContain('work: "active-work"');
        expect(spec).toContain('historical: "history"');
    });

    it("summary overview renders the default composition — and never the dormant readiness_kpi", () => {
        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {},
            title: "Smith Family",
            perspective: null,
            statusLabel: "New",
        });

        const keys = grid.rows.flatMap((row) => row.cells.map((c) => c.key));

        // The Summary grid is GENERATED from the default composition — assert against that source of
        // truth, not a hand-copied list, so the two can never drift apart again. The previous
        // assertion here (`["household","readiness_kpi","children","current_work"]`) locked the
        // retired `SUMMARY_GRID` authority and had been red ever since; `communications` and
        // `tour_summary` are also present now, as `linked`, so the old negatives for them were false.
        expect(keys).toEqual(FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.map((entry) => entry.key));

        // `readiness_kpi` is COMMIT-CRITICAL but placed by no composition — dormant capability, not
        // dead code (a tenant may publish it). Its absence here is the fact that makes the
        // commit-critical build unconditional w.r.t. placement; see focusPanelCommitCriticalCardParticipation.test.ts.
        expect(keys).not.toContain("readiness_kpi");

        // Still suppressed from Overview.
        expect(keys).not.toContain("attention");
        expect(keys).not.toContain("current_mission");
        expect(keys).not.toContain("documents");
        expect(keys).not.toContain("health");
    });

    // REMOVED: "Core Four footprints drive cell widths (no flat span:1)".
    //
    // It asserted SYSTEM5_CARD_FOOTPRINT -> `span` for mode "summary", via the retired
    // `SUMMARY_GRID`. Those spans never reached the DOM: Summary renders from the active
    // LayoutDoc's 12-column `focusPanelLayout` grid (published lanes), where cell `span` is inert
    // — browser-measured as uniform 6/12 lanes, 427px each. The test therefore locked a width
    // authority the runtime does not use, and `readiness_kpi` is not in the Summary composition
    // at all. Summary composition is asserted where it actually lives, in
    // `focusPanelSummaryDefaultComposition.test.ts`; `span` emphasis is asserted for Work — its
    // one live consumer — in `focusPanelWorkCompositionParity.test.ts`.

    it("hides primary next action card when header action is present", () => {
        const { cards } = deriveOpportunityFocusPanelPresentation({
            mode: "work",
            displayVm: baseVm,
            record: {},
            title: "Smith Family",
            perspective: null,
            statusLabel: "New",
        });

        expect(cards.get("primary_next_action")?.visible).toBe(false);
    });

    it("activity communications embeds via Embedded workspace component", () => {
        const workspace = readSrc("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        expect(workspace).toContain("CommunicationsDrawerSection");
        expect(workspace).toContain('data-embedded-workspace="communications"');
    });

    it("summary communications card renderer stays context-only", () => {
        const renderer = readSrc("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        expect(renderer).not.toContain("CommunicationsDrawerSection");
        // CommunicationsCard is a pure card — it bypasses compat entirely (stricter than the old activity gate).
        expect(renderer).toContain("CommunicationsCard");
        expect(renderer).not.toContain('case "communications"');
    });

    it("work idle checklist follows Why Now → step → blockers order", () => {
        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "work",
            displayVm: baseVm,
            record: {},
            title: "Smith Family",
            perspective: null,
            statusLabel: "New",
        });

        const rowKeys = grid.rows.map((row) => row.cells.map((c) => c.key));
        expect(rowKeys[0]).toEqual(["attention"]);
        expect(rowKeys[1]).toEqual(["workflow_steps", "required_information"]);
        expect(rowKeys[2]).toEqual(["work_launcher"]);
    });
});

describe("Work View perspectives convergence", () => {
    it("operatorOperationalPerspectivesEnabled is always on (runtime flag retired)", () => {
        const flagSrc = readSrc("lib/adminV2/runtime/configurationRuntimeConvergenceFlag.ts");
        expect(flagSrc).toContain("operatorOperationalPerspectivesEnabled");
        expect(flagSrc).not.toContain("ALLOY_OS_RUNTIME_ENABLED");
        expect(operatorOperationalPerspectivesEnabled()).toBe(true);
    });

    it("deriveOperationalViewsFromQueueDefinition skips internal lanes", () => {
        const views = deriveOperationalViewsFromQueueDefinition({
            version: 2,
            entity_type: "opportunity",
            queues: [
                { key: "needs_attention", label: "Needs attention", grain: "case" },
                { key: "tours", label: "Tours", grain: "case" },
            ],
        });
        expect(views.map((v) => v.queue_key)).toEqual(["tours"]);
    });

    it("relabelPrimaryPillSectionWorkView applies operator-facing label", () => {
        const relabeled = relabelPrimaryPillSectionWorkView([
            {
                key: "pipeline",
                label: "Pipeline",
                tone: "standard",
                queues: [{ key: "tours", label: "Tours" }],
            },
        ]);
        expect(relabeled?.[0]?.label).toBe("Work View");
    });

    it("work-unit page uses Work View pills when perspectives enabled for builder shell", () => {
        const page = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        );
        expect(page).toContain("operatorOperationalPerspectivesEnabled");
        expect(page).toContain("relabelPrimaryPillSectionWorkView");
        expect(page).toContain("builderOwnedLifecycleShell && !workViewPerspectivesEnabled");
    });
});

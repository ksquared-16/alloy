import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
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
        actions: {
            header_menu: [{ action_key: "schedule_tour", label: "Schedule tour" } as never],
            drawer_tabs: [],
        },
        summaries: {
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

    it("summary overview is scoped to the Core Four operational cards", () => {
        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {},
            title: "Smith Family",
            perspective: null,
            statusLabel: "New",
        });

        const keys = grid.rows.flatMap((row) => row.cells.map((c) => c.key));
        expect(keys).toEqual(["household", "readiness_kpi", "children", "current_work"]);
        // Suppressed (not deleted) from Overview for the Core Four validation pass.
        expect(keys).not.toContain("attention");
        expect(keys).not.toContain("current_mission");
        expect(keys).not.toContain("communications");
        expect(keys).not.toContain("documents");
        expect(keys).not.toContain("tour_summary");
        expect(keys).not.toContain("health");
    });

    it("Core Four footprints drive cell widths (no flat span:1)", () => {
        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {},
            title: "Smith Family",
            perspective: null,
            statusLabel: "New",
        });
        const spanByKey = new Map(
            grid.rows.flatMap((row) => row.cells.map((c) => [c.key, c.span] as const)),
        );
        expect(spanByKey.get("household")).toBe(2); // wide
        expect(spanByKey.get("children")).toBe(2); // wide
        expect(spanByKey.get("readiness_kpi")).toBe(1); // medium
        expect(spanByKey.get("current_work")).toBe(1); // narrow
    });

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
        expect(renderer).toContain('focusPanelMode !== "activity"');
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
    it("operatorOperationalPerspectivesEnabled follows Alloy OS runtime flag wiring", () => {
        const flagSrc = readSrc("lib/adminV2/runtime/configurationRuntimeConvergenceFlag.ts");
        expect(flagSrc).toContain("ALLOY_OS_RUNTIME_ENABLED");
        expect(typeof operatorOperationalPerspectivesEnabled()).toBe("boolean");
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

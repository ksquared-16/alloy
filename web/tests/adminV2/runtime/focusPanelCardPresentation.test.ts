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

    it("UniversalCard exposes data-card-role tier vocabulary", () => {
        const card = readSrc("components/admin/focusPanel/UniversalCard.tsx");
        expect(card).toContain('data-card-role={cardRole}');
        expect(card).toContain('attention: "critical"');
        expect(card).toContain('work: "active-work"');
        expect(card).toContain('historical: "history"');
    });

    it("summary grid uses business-question card keys, not layout section names", () => {
        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {},
            title: "Smith Family",
            perspective: null,
            statusLabel: "New",
        });

        const keys = grid.rows.flatMap((row) => row.cells.map((c) => c.key));
        expect(keys).toContain("attention");
        expect(keys).toContain("current_mission");
        expect(keys).toContain("household");
        expect(keys).not.toContain("source");
        expect(keys).not.toContain("overview");
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

    it("activity communications renderer does not embed composer by default", () => {
        const renderer = readSrc("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        expect(renderer).not.toContain("CommunicationsDrawerSection");
        expect(renderer).toContain('focusPanelMode === "activity"');
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
        expect(rowKeys[1]).toEqual(["workflow_steps"]);
        expect(rowKeys[2]).toEqual(["required_information"]);
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

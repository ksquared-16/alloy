import { describe, expect, it } from "vitest";
import { applyDrawerSubjectStageFocusToLifecycleRailModel } from "@/lib/admin/drawer/applyDrawerSubjectStageFocusToLifecycleRailModel";
import {
    inquiryChildRowMatchesSubjectFocus,
    resolveDrawerSubjectFocusPresentation,
} from "@/lib/admin/drawer/resolveDrawerSubjectFocusPresentation";
import { buildPartialQueueRowContext } from "@/lib/workUnits/buildPartialQueueRowContext";
import { buildDrawerSubjectContextFromQueueRowContext } from "@/lib/workUnits/buildDrawerSubjectContextFromQueueRowContext";
import type { DrawerSubjectContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import { buildOpportunityDrawerQueueNavigatorFromDisplayItems } from "@/lib/admin/opportunityDrawerQueueNavigator";
import { drawerSubjectContextForQueueNavigatorRecord } from "@/lib/admin/opportunityDrawerQueueNavigator";
import { buildRestoredOpportunityDrawerState } from "@/lib/adminV2/viewModel/drawer/vmRuntime/restoreOpportunityDrawerSession";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

const queue = { key: "tours", label: "Tours", lifecycle_key: "enrollment", stage_key: "tour" };

describe("resolveDrawerSubjectFocusPresentation", () => {
    it("returns no strip for missing context", () => {
        const p = resolveDrawerSubjectFocusPresentation(null);
        expect(p.showFocusStrip).toBe(false);
        expect(p.shouldOverrideLifecycleRail).toBe(false);
    });

    it("returns no strip for case_default context", () => {
        const ctx = buildDrawerSubjectContextFromQueueRowContext(
            buildPartialQueueRowContext({
                row: { id: "opp-1", name: "Smith Household", status_key: "tour_scheduled" },
                queue,
            }),
        );
        expect(ctx?.focus_mode).toBe("case_default");
        const p = resolveDrawerSubjectFocusPresentation(ctx);
        expect(p.showFocusStrip).toBe(false);
        expect(p.shouldOverrideLifecycleRail).toBe(false);
    });

    it("shows strip and highlight ids for child subject context", () => {
        const ctx: DrawerSubjectContext = {
            focus_mode: "subject_highlight",
            lifecycle_visual_stage_key: "tour",
            stage_focus_label: "Tours",
            active_subject: {
                subject_type: "child",
                subject_id: "child-person-1",
                lifecycle_key: "enrollment",
                stage_key: "tour",
                status_key: "tour_scheduled",
                case_anchor: { entity_type: "opportunities", entity_id: "opp-1" },
            },
            related_subjects: [
                {
                    subject_type: "child",
                    subject_id: "child-person-1",
                    display_name: "Riley Smith",
                    status_label: "Touring",
                },
            ],
        };
        const p = resolveDrawerSubjectFocusPresentation(ctx);
        expect(p.showFocusStrip).toBe(true);
        expect(p.stripLabel).toContain("Riley Smith");
        expect(p.stripLabel).toContain("Tours");
        expect(p.shouldOverrideLifecycleRail).toBe(true);
        expect(p.highlightSubjectIds).toContain("child-person-1");
        expect(p.dataAttributes["data-drawer-active-subject-id"]).toBe("child-person-1");
    });

    it("shows group strip without crashing", () => {
        const ctx: DrawerSubjectContext = {
            focus_mode: "subject_group_highlight",
            lifecycle_visual_stage_key: "tour",
            stage_focus_label: "Tours",
            active_subject_group: [
                {
                    subject_type: "child",
                    subject_id: "child-a",
                    lifecycle_key: "enrollment",
                    stage_key: "tour",
                    status_key: "tour_scheduled",
                },
                {
                    subject_type: "child",
                    subject_id: "child-b",
                    lifecycle_key: "enrollment",
                    stage_key: "tour",
                    status_key: "tour_scheduled",
                },
            ],
            related_subjects: [],
        };
        const p = resolveDrawerSubjectFocusPresentation(ctx);
        expect(p.stripLabel).toBe("2 children — Tours");
        expect(p.dataAttributes["data-drawer-active-subject-group-count"]).toBe("2");
    });
});

describe("applyDrawerSubjectStageFocusToLifecycleRailModel", () => {
    it("moves current index to matching stage key", () => {
        const model = {
            steps: [
                { key: "new_leads", label: "New", state: "complete" as const },
                { key: "tours", label: "Tours", state: "future" as const },
                { key: "enrolled", label: "Enrolled", state: "future" as const },
            ],
            currentIndex: 0,
        };
        const focused = applyDrawerSubjectStageFocusToLifecycleRailModel(model, "tour");
        expect(focused?.currentIndex).toBe(1);
        expect(focused?.steps[1]?.state).toBe("current");
    });
});

describe("inquiryChildRowMatchesSubjectFocus", () => {
    it("matches person_id against highlight ids", () => {
        expect(
            inquiryChildRowMatchesSubjectFocus({ person_id: "child-1" }, ["child-1"]),
        ).toBe(true);
        expect(inquiryChildRowMatchesSubjectFocus({ person_id: "other" }, ["child-1"])).toBe(false);
    });
});

describe("queue navigator subject context", () => {
    it("carries drawer_subject_context per record", () => {
        const context = buildPartialQueueRowContext({
            row: { id: "opp-1", name: "Lee Family", status_key: "qualified" },
            queue,
        });
        const item: QueuePreviewItemVm = {
            id: "opp-1",
            title: "Lee Family",
            quickActions: [],
            _queue_row_context: context,
        };
        const nav = buildOpportunityDrawerQueueNavigatorFromDisplayItems({
            work_unit_id: "wu-1",
            department_id: "dept-1",
            queue_key: "tours",
            selection: { queueKey: "tours" },
            displayItems: [item],
            generation: 1,
        });
        const ctx = drawerSubjectContextForQueueNavigatorRecord(nav, "opp-1");
        expect(ctx?.active_subject?.subject_id).toBe("opp-1");
    });
});

describe("restoreOpportunityDrawerState", () => {
    it("preserves drawerSubjectContext from stack item", () => {
        const ctx: DrawerSubjectContext = {
            focus_mode: "subject_highlight",
            lifecycle_visual_stage_key: "tour",
            related_subjects: [],
            active_subject: {
                subject_type: "child",
                subject_id: "child-1",
                lifecycle_key: "enrollment",
                stage_key: "tour",
                status_key: "tour_scheduled",
            },
        };
        const state = buildRestoredOpportunityDrawerState(
            {
                type: "opportunities",
                id: "opp-1",
                drawerSubjectContext: ctx,
            },
            null,
        );
        expect(state.drawerSubjectContext).toBe(ctx);
    });
});

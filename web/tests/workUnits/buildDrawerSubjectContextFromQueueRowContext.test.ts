import { describe, expect, it } from "vitest";
import { buildPartialQueueRowContext } from "@/lib/workUnits/buildPartialQueueRowContext";
import {
    buildDrawerSubjectContextFromQueueRowContext,
    drawerSubjectContextDiagnosticAttrs,
} from "@/lib/workUnits/buildDrawerSubjectContextFromQueueRowContext";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import { opportunityDrawerSubjectContextFromQueueItem } from "@/lib/admin/opportunityDrawerSubjectContextFromQueueItem";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

const queue = { key: "tours", label: "Tours", lifecycle_key: "enrollment", stage_key: "tour" };

describe("buildDrawerSubjectContextFromQueueRowContext", () => {
    it("maps drawer_open.active_subject for case-grain rows", () => {
        const context = buildPartialQueueRowContext({
            row: { id: "opp-1", name: "Smith Household", status_key: "tour_scheduled" },
            queue,
        });
        const drawerCtx = buildDrawerSubjectContextFromQueueRowContext(context);
        expect(drawerCtx).not.toBeNull();
        expect(drawerCtx!.active_subject?.subject_type).toBe("case");
        expect(drawerCtx!.active_subject?.subject_id).toBe("opp-1");
        expect(drawerCtx!.focus_mode).toBe("case_default");
        expect(drawerCtx!.lifecycle_visual_stage_key).toBe("tour");
        expect(drawerCtx!.related_subjects.length).toBeGreaterThanOrEqual(0);
    });

    it("returns null without queue row context", () => {
        expect(buildDrawerSubjectContextFromQueueRowContext(null)).toBeNull();
        expect(opportunityDrawerSubjectContextFromQueueItem(null)).toBeNull();
    });

    it("supports grouped active_subject_group without crashing", () => {
        const base = buildPartialQueueRowContext({
            row: { id: "opp-2", name: "Grouped Household", status_key: "tour_scheduled" },
            queue,
        });
        const grouped: QueueRowContext = {
            ...base,
            drawer_open: {
                ...base.drawer_open,
                stage_focus_key: "tour",
                active_subject_group: [
                    {
                        subject_type: "child",
                        subject_id: "child-a",
                        lifecycle_key: "enrollment",
                        stage_key: "tour",
                        status_key: "tour_scheduled",
                        case_anchor: { entity_type: "opportunities", entity_id: "opp-2" },
                    },
                    {
                        subject_type: "child",
                        subject_id: "child-b",
                        lifecycle_key: "enrollment",
                        stage_key: "tour",
                        status_key: "tour_scheduled",
                        case_anchor: { entity_type: "opportunities", entity_id: "opp-2" },
                    },
                ],
            },
        };
        const drawerCtx = buildDrawerSubjectContextFromQueueRowContext(grouped);
        expect(drawerCtx?.focus_mode).toBe("subject_group_highlight");
        expect(drawerCtx?.active_subject_group).toHaveLength(2);
        expect(drawerCtx?.lifecycle_visual_stage_key).toBe("tour");
        const attrs = drawerSubjectContextDiagnosticAttrs(drawerCtx);
        expect(attrs["data-drawer-active-subject-group-count"]).toBe("2");
        expect(attrs["data-drawer-stage-focus-key"]).toBe("tour");
    });

    it("maps preview item _queue_row_context to drawer subject context", () => {
        const context = buildPartialQueueRowContext({
            row: { id: "opp-3", name: "Lee Family", status_key: "qualified" },
            queue,
        });
        const item: QueuePreviewItemVm = {
            id: "opp-3",
            title: "Lee Family",
            quickActions: [],
            _queue_row_context: context,
        };
        const drawerCtx = opportunityDrawerSubjectContextFromQueueItem(item);
        expect(drawerCtx?.active_subject?.subject_id).toBe("opp-3");
        expect(drawerSubjectContextDiagnosticAttrs(drawerCtx)["data-drawer-active-subject-present"]).toBe("true");
    });
});

/**
 * Published Queue Row Surface authority — family-grain All/Tours must not be overwritten by a
 * stage-only Waitlist candidate variant (Gate 2: configuration steers runtime).
 */

import { describe, expect, it } from "vitest";
import type { QueueRecordLayoutConfigV3, QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";
import {
    queueRowVariantMatchInputFromContext,
    resolveQueueRowCompactSlots,
} from "@/lib/presentation/runtime/queueRowVariantResolve";
import { resolveQueueRowVariant } from "@/lib/presentation/runtime/resolveQueueRowVariant";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

const FIXED = { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" as const };

const WAITLIST_VARIANT: QueueRowVariant = {
    id: "variant-32",
    label: "Waitlist",
    priority: 10,
    appliesWhen: { stage_key: ["waitlist"] },
    subjectFocus: "placement_candidate_child",
    columns: [
        {
            id: "col-wl-id",
            label: "",
            width: "identity",
            rowIndex: 0,
            builderSlot: "identity",
            scope: { type: "main_record" },
            blocks: [
                {
                    id: "b-wl",
                    type: "field_group",
                    layout: "stack",
                    fields: [{ id: "f-child", label: "Child", display: "link", fieldKey: "child.name" }],
                },
            ],
        },
    ],
    fixedControls: FIXED,
};

const LAYOUT: QueueRecordLayoutConfigV3 = {
    variant: "operational-row",
    version: 3,
    columns: [
        {
            id: "col-default-id",
            label: "",
            width: "identity",
            rowIndex: 0,
            builderSlot: "identity",
            scope: { type: "main_record" },
            blocks: [
                {
                    id: "b-hh",
                    type: "field_group",
                    layout: "stack",
                    fields: [
                        {
                            id: "f-hh",
                            label: "Household name",
                            display: "link",
                            fieldKey: "customer.display_name",
                        },
                    ],
                },
            ],
        },
        {
            id: "col-default-status",
            label: "",
            width: "status",
            rowIndex: 0,
            builderSlot: "status",
            scope: { type: "main_record" },
            blocks: [
                {
                    id: "b-stage",
                    type: "field_group",
                    layout: "stack",
                    fields: [
                        {
                            id: "f-stage",
                            label: "Stage",
                            display: "text",
                            fieldKey: "queue_row.stage_label",
                        },
                    ],
                },
            ],
        },
        {
            id: "col-default-children",
            label: "",
            width: "children",
            rowIndex: 0,
            builderSlot: "groupCount",
            scope: { type: "repeated_related", relationshipKey: "children" },
            blocks: [
                {
                    id: "b-names",
                    type: "repeated_record_block",
                    display: "rows",
                    maxItems: 3,
                    itemLabel: "Child",
                    emptyState: "None",
                    presentation: "row-list",
                    relationshipKey: "children",
                    fields: [
                        {
                            id: "f-names",
                            label: "Children names",
                            display: "text",
                            fieldKey: "children.names",
                        },
                    ],
                },
            ],
        },
    ],
    fixedControls: FIXED,
    variants: [WAITLIST_VARIANT],
};

function familyCaseContext(stageKey: string): QueueRowContext {
    return {
        row_subject: {
            subject_type: "case",
            subject_id: "opp-kurzman",
            display_name: "Kurzman Family",
            stage_key: stageKey,
        },
        row_stage_key: stageKey,
        row_status_key: "open",
        lifecycle_key: "enrollment",
        case_context: { display_name: "Kurzman Family" },
        related_subjects_summary: [
            { subject_id: "c1", display_name: "Lennon Kurzman", visibility: "visible" },
            { subject_id: "c2", display_name: "Wrigley Kurzman", visibility: "visible" },
        ],
        primary_contact: { display_name: "Kelly Kurzman", phone: "(602) 290-4816" },
        drawer_open: {
            stage_focus_key: stageKey,
            active_subject: { stage_key: stageKey },
        },
    } as unknown as QueueRowContext;
}

describe("published Surface family-grain authority", () => {
    it("All/Tours family rows keep Default Household + Stage — not Waitlist child.name", () => {
        const ctx = familyCaseContext("waitlist");
        const input = queueRowVariantMatchInputFromContext(ctx, {
            workViewId: "new_work_view_6",
            workViewKey: "all",
        });
        expect(input.grain).toBe("case");
        expect(input.stageKey).toBe("waitlist");
        expect(resolveQueueRowVariant(LAYOUT.variants, input)).toBeNull();

        const slots = resolveQueueRowCompactSlots(LAYOUT, input);
        expect(slots.subject.fieldKeys).toEqual(["customer.display_name"]);
        expect(slots.status.fieldKeys).toEqual(["queue_row.stage_label"]);
        expect(slots.groupCount.fieldKeys).toContain("children.names");
        expect(slots.subject.fieldKeys).not.toContain("child.name");
    });

    it("Waitlist candidate grain still selects the Waitlist variant", () => {
        const input = {
            stageKey: "waitlist",
            grain: "candidate",
            workViewId: "new_work_view_4",
            processKey: "enrollment",
        };
        expect(resolveQueueRowVariant(LAYOUT.variants, input)?.id).toBe("variant-32");
        const slots = resolveQueueRowCompactSlots(LAYOUT, input);
        expect(slots.subject.fieldKeys).toEqual(["child.name"]);
    });
});

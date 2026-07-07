/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { resolveCompactSlotDisplay } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";

function familyContext(over: Partial<QueueRowContext> = {}): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Jordan Lee" },
        row_stage: "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "Open",
        case_context: {
            case_id: "opp-1",
            display_name: "Jordan Lee",
            case_type_label: "Enrollment",
            case_status_key: "open",
            case_status_label: "Open",
        },
        primary_contact: { display_name: "Casey Lee" },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-1",
                display_name: "Avery Lee",
                status_label: "Lead",
            },
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Rowan Lee",
                status_label: "Lead",
            },
        ],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
        ...over,
    };
}

function childContext(): QueueRowContext {
    return familyContext({
        row_subject: { subject_type: "child", subject_id: "child-1", display_name: "Avery Lee" },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "child-2",
                display_name: "Rowan Lee",
                status_label: "Lead",
            },
        ],
    });
}

function configWithStageField(): QueueRecordLayoutConfigV3 {
    return {
        variant: "operational-row",
        version: 3,
        columns: [
            {
                id: "status-col",
                label: "",
                width: "status_band",
                scope: { type: "lifecycle_context" },
                builderSlot: "status",
                blocks: [
                    {
                        type: "field_group",
                        id: "status-group",
                        fields: [
                            {
                                id: "stage-field",
                                fieldKey: "queue_row.stage_label",
                                label: "Stage",
                                display: "pill",
                            },
                        ],
                    },
                ],
            },
        ],
        fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
    };
}

describe("resolveCompactSlotDisplay", () => {
    it("renders configured Stage field as runtime status label, not the static field label", () => {
        const config = mapQueueRowSurfaceToCompactConfig(configWithStageField());
        const display = resolveCompactSlotDisplay("status", familyContext(), config.slots.status, null);
        expect(display).toBe("Open");
        expect(display).not.toBe("Stage");
    });

    it("renders child name on child-grain rows", () => {
        const slots = {
            visible: true,
            label: "Child name",
            fieldKeys: ["child.name"],
        } as const;
        expect(resolveCompactSlotDisplay("groupCount", childContext(), slots, null)).toBe("Avery Lee");
    });

    it("renders children names on family-grain rows and omits blank child name", () => {
        const slots = {
            visible: true,
            label: "Child name",
            fieldKeys: ["child.name"],
        } as const;
        const family = familyContext();
        expect(resolveCompactSlotDisplay("groupCount", family, slots, null)).toBe("Avery Lee, Rowan Lee");

        const emptyFamily = familyContext({ related_subjects_summary: [] });
        expect(resolveCompactSlotDisplay("groupCount", emptyFamily, slots, null)).toBeNull();
    });

    it("renders children count and summary on family rows", () => {
        const count = resolveCompactSlotDisplay(
            "groupCount",
            familyContext(),
            { visible: true, label: null, fieldKeys: ["children.count"] },
            null,
        );
        expect(count).toBe("2 children");

        const summary = resolveCompactSlotDisplay(
            "groupCount",
            familyContext(),
            { visible: true, label: null, fieldKeys: ["children.summary"] },
            null,
        );
        expect(summary).toBe("2 children: Avery Lee, Rowan Lee");
    });
});

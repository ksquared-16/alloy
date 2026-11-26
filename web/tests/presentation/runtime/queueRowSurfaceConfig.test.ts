import { describe, expect, it } from "vitest";
import type {
    QueueRecordFieldConfig,
    QueueRecordLayoutConfigV3,
} from "@/lib/layout/queueRecordLayoutV3";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";

function field(fieldKey: string, label?: string): QueueRecordFieldConfig {
    return { id: `f-${fieldKey}`, fieldKey, label, display: "text" };
}

/** A one-column config carrying the given fields in a single field group. */
function configWith(fields: QueueRecordFieldConfig[]): QueueRecordLayoutConfigV3 {
    return {
        variant: "operational-row",
        version: 3,
        columns: [
            {
                id: "col-1",
                label: "",
                width: "identity",
                scope: { type: "main_record" },
                blocks: [{ type: "field_group", id: "g-1", fields }],
            },
        ],
        fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
    };
}

describe("mapQueueRowSurfaceToCompactConfig", () => {
    it("null config → all slots visible, no label overrides, everything in fallbacks", () => {
        const { slots, fallbackSlots } = mapQueueRowSurfaceToCompactConfig(null);
        for (const key of ["subject", "status", "contact", "attention", "work", "groupCount"] as const) {
            expect(slots[key]).toEqual({ visible: true, label: null });
        }
        expect(fallbackSlots.sort()).toEqual(
            ["attention", "contact", "groupCount", "status", "subject", "work"].sort(),
        );
    });

    it("present mapped field → visible with builder label metadata and fieldKeys", () => {
        const config = configWith([
            field("customer.display_name", "Household"),
            field("opportunity.status_label", "Disposition"),
            field("person.primary_contact_name", "Primary contact"),
            field("opportunity.attention_reason", "Attention"),
            field("queue_row.work_summary", "Open work"),
            field("queue_row.group_count_label", "Tracks"),
        ]);
        const { slots, fallbackSlots } = mapQueueRowSurfaceToCompactConfig(config);
        expect(slots.subject).toEqual({ visible: true, label: "Household", fieldKeys: ["customer.display_name"] });
        expect(slots.status).toEqual({ visible: true, label: "Disposition", fieldKeys: ["opportunity.status_label"] });
        expect(slots.contact).toEqual({ visible: true, label: "Primary contact", fieldKeys: ["person.primary_contact_name"] });
        expect(slots.attention).toEqual({ visible: true, label: "Attention", fieldKeys: ["opportunity.attention_reason"] });
        expect(slots.work).toEqual({ visible: true, label: "Open work", fieldKeys: ["queue_row.work_summary"] });
        expect(slots.groupCount).toEqual({ visible: true, label: "Tracks", fieldKeys: ["queue_row.group_count_label"] });
        // Every slot mapped → nothing fell back.
        expect(fallbackSlots).toEqual([]);
    });

    it("present field with no label → visible, label null, fieldKeys preserved", () => {
        const config = configWith([field("customer.display_name")]);
        const { slots, fallbackSlots } = mapQueueRowSurfaceToCompactConfig(config);
        expect(slots.subject).toEqual({ visible: true, label: null, fieldKeys: ["customer.display_name"] });
        // subject mapped (present), the rest fell back.
        expect(fallbackSlots).not.toContain("subject");
        expect(fallbackSlots).toContain("status");
    });

    it("absent field → generic fallback (visible, no override) and listed in fallbacks", () => {
        // Only the status field is published; every other slot has no mapped field.
        const config = configWith([field("opportunity.status_label", "Disposition")]);
        const { slots, fallbackSlots } = mapQueueRowSurfaceToCompactConfig(config);
        expect(slots.status).toEqual({ visible: true, label: "Disposition", fieldKeys: ["opportunity.status_label"] });
        // Absent slots never HIDE — they stay generic-visible with no override.
        expect(slots.subject).toEqual({ visible: true, label: null });
        expect(slots.contact).toEqual({ visible: true, label: null });
        expect(slots.attention).toEqual({ visible: true, label: null });
        expect(slots.work).toEqual({ visible: true, label: null });
        expect(slots.groupCount).toEqual({ visible: true, label: null });
        expect(fallbackSlots.sort()).toEqual(
            ["attention", "contact", "groupCount", "subject", "work"].sort(),
        );
    });

    it("secondary mapped fieldKey satisfies a slot (e.g. queue_row.subject_label → subject)", () => {
        const config = configWith([
            field("queue_row.subject_label", "Subject"),
            field("queue_row.next_best_action_label", "Suggested action"),
            field("queue_row.stage_label", "Stage"),
        ]);
        const { slots, fallbackSlots } = mapQueueRowSurfaceToCompactConfig(config);
        expect(slots.subject).toEqual({ visible: true, label: "Subject", fieldKeys: ["queue_row.subject_label"] });
        expect(slots.status).toEqual({ visible: true, label: "Stage", fieldKeys: ["queue_row.stage_label"] });
        expect(slots.work).toEqual({ visible: true, label: "Suggested action", fieldKeys: ["queue_row.next_best_action_label"] });
        expect(fallbackSlots.sort()).toEqual(["attention", "contact", "groupCount"].sort());
    });

    it("primary fieldKey wins over secondary when both present", () => {
        const config = configWith([
            field("queue_row.stage_label", "Stage"),
            field("opportunity.status_label", "Disposition"),
        ]);
        const { slots } = mapQueueRowSurfaceToCompactConfig(config);
        // status maps [opportunity.status_label, queue_row.stage_label] — primary wins.
        expect(slots.status.label).toBe("Disposition");
        expect(slots.status.fieldKeys).toEqual(["opportunity.status_label"]);
    });
});

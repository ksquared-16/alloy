import { describe, expect, it } from "vitest";
import {
    queueRowVariantMatchInputFromContext,
    resolveQueueRowCompactSlots,
} from "@/lib/presentation/runtime/queueRowVariantResolve";
import type { QueueRecordColumnConfig, QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

/** A status column whose status_label field label is distinctive, so we can prove which variant won. */
function statusColumn(statusLabel: string): QueueRecordColumnConfig {
    return {
        id: "col-status",
        label: "",
        width: "status_band",
        scope: { type: "lifecycle_context" },
        blocks: [
            {
                type: "field_group",
                id: "grp-status",
                fields: [{ id: "f-status", fieldKey: "opportunity.status_label", label: statusLabel, display: "pill" }],
            },
        ],
    };
}

const CONFIG: QueueRecordLayoutConfigV3 = {
    variant: "operational-row",
    version: 3,
    columns: [statusColumn("Default Status")],
    fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
    variants: [
        {
            id: "waitlist",
            label: "Waitlist",
            priority: 10,
            appliesWhen: { grain: ["candidate"] },
            columns: [statusColumn("Waitlist Status")],
        },
    ],
};

describe("queueRowVariantMatchInputFromContext", () => {
    it("extracts stage/status/grain/process from the frozen context", () => {
        const context = {
            row_subject: { subject_type: "candidate", subject_id: "pc-1", display_name: "Child A" },
            row_status_key: "waitlisted",
            lifecycle_key: "enrollment",
            drawer_open: { entity_type: "opportunities", entity_id: "opp-1", stage_focus_key: "waitlist" },
        } as unknown as QueueRowContext;

        const input = queueRowVariantMatchInputFromContext(context, { workViewId: "wv-9" });
        expect(input).toMatchObject({
            grain: "candidate",
            statusKey: "waitlisted",
            stageKey: "waitlist",
            processKey: "enrollment",
            workViewId: "wv-9",
            rowType: "candidate",
        });
    });
});

describe("resolveQueueRowCompactSlots", () => {
    it("uses the matching variant's columns (waitlist for candidate grain)", () => {
        const slots = resolveQueueRowCompactSlots(CONFIG, { grain: "candidate" });
        expect(slots.status.label).toBe("Waitlist Status");
    });

    it("falls back to the top-level Default columns when no variant matches", () => {
        const slots = resolveQueueRowCompactSlots(CONFIG, { grain: "case" });
        expect(slots.status.label).toBe("Default Status");
    });

    it("null config → generic-context slots (no label override)", () => {
        const slots = resolveQueueRowCompactSlots(null, { grain: "case" });
        expect(slots.status.label).toBeNull();
        expect(slots.status.visible).toBe(true);
    });

    it("empty matched variant columns inherit Default (do not blank the row)", () => {
        const withEmptyVariant: QueueRecordLayoutConfigV3 = {
            ...CONFIG,
            variants: [
                {
                    id: "v-empty",
                    label: "Tour",
                    priority: 10,
                    appliesWhen: { stage_key: ["tour_scheduled"] },
                    columns: [],
                },
            ],
        };
        const slots = resolveQueueRowCompactSlots(withEmptyVariant, { stageKey: "tour_scheduled" });
        expect(slots.status.label).toBe("Default Status");
    });
});

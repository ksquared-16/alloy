/**
 * Waitlist published variant convergence — stage key on child context + sortCriteria consumption.
 */

import { describe, expect, it } from "vitest";
import { childQueueRowContext } from "@/lib/runtime/provisioning/childGrainSurfaceComposition";
import {
    queueRowVariantMatchInputFromContext,
    resolveQueueRowCompactSlots,
} from "@/lib/presentation/runtime/queueRowVariantResolve";
import { resolveQueueRowVariant } from "@/lib/presentation/runtime/resolveQueueRowVariant";
import { applyQueueRowVariantSortCriteria } from "@/lib/presentation/runtime/applyQueueRowVariantSortCriteria";
import type { QueueRecordLayoutConfigV3, QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";
import type { ChildProvisioningRow } from "@/lib/runtime/provisioning/childGrainProvisioningRows";

const WAITLIST_VARIANT: QueueRowVariant = {
    id: "variant-32",
    label: "Waitlist",
    priority: 10,
    appliesWhen: { stage_key: ["waitlist"] },
    sortCriteria: [{ key: "waitlist.priority", direction: "desc", nulls: "last" }],
    groupByCriteria: [{ key: "program" }],
    columns: [
        {
            id: "col-1",
            label: "",
            width: "identity",
            rowIndex: 0,
            builderSlot: "identity",
            scope: { type: "main_record" },
            blocks: [
                {
                    id: "b1",
                    type: "field_group",
                    layout: "stack",
                    fields: [{ id: "f1", label: "Child", display: "link", fieldKey: "child.name" }],
                },
            ],
        },
    ],
};

const LAYOUT: QueueRecordLayoutConfigV3 = {
    variant: "operational-row",
    version: 3,
    columns: [],
    fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
    variants: [WAITLIST_VARIANT],
};

function childRow(partial: Partial<ChildProvisioningRow> & Pick<ChildProvisioningRow, "subjectId" | "participationId">): ChildProvisioningRow {
    return {
        subjectId: partial.subjectId,
        participationId: partial.participationId,
        contextId: partial.contextId ?? "opp-1",
        title: partial.title ?? "Child",
        stageKey: partial.stageKey ?? "waitlist",
        statusKey: partial.statusKey ?? "waitlisted",
        updatedAt: partial.updatedAt ?? null,
    } as ChildProvisioningRow;
}

describe("Waitlist published variant convergence", () => {
    it("child context exposes stage_key so Waitlist appliesWhen matches", () => {
        const ctx = childQueueRowContext({
            row: childRow({ subjectId: "cm-1", participationId: "pi-1", stageKey: "waitlist" }),
            stageLabel: "Waitlist",
            stageLabelsByKey: { waitlist: "Waitlist" },
            lifecycleKey: "enrollment",
            familyName: "Kurzman Family",
        });
        expect(ctx?.row_stage_key).toBe("waitlist");
        expect(ctx?.drawer_open.stage_focus_key).toBe("waitlist");
        expect(ctx?.drawer_open.active_subject?.stage_key).toBe("waitlist");

        const input = queueRowVariantMatchInputFromContext(ctx!, { workViewId: "wv-waitlist" });
        expect(input.stageKey).toBe("waitlist");
        expect(resolveQueueRowVariant(LAYOUT.variants, input)?.id).toBe("variant-32");
    });

    it("matched Waitlist variant columns feed compact identity (child.name)", () => {
        const ctx = childQueueRowContext({
            row: childRow({ subjectId: "cm-1", participationId: "pi-1" }),
            stageLabel: "Waitlist",
            stageLabelsByKey: { waitlist: "Waitlist" },
            lifecycleKey: "enrollment",
            familyName: "Kurzman",
        })!;
        const input = queueRowVariantMatchInputFromContext(ctx, { workViewId: null });
        const slots = resolveQueueRowCompactSlots(LAYOUT, input);
        expect(slots.subject.fieldKeys?.includes("child.name") || slots.subject.visible).toBeTruthy();
    });

    it("applyQueueRowVariantSortCriteria orders by waitlist.priority desc", () => {
        const rows = [
            { id: "a", waitlist_context: { priority: 1 } },
            { id: "b", waitlist_context: { priority: 9 } },
            { id: "c", waitlist_context: { priority: 5 } },
        ];
        const sorted = applyQueueRowVariantSortCriteria(rows, [
            { key: "waitlist.priority", direction: "desc", nulls: "last" },
        ]);
        expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
    });
});

/**
 * Proof + regression: Secondary is absent when related_subjects_summary is empty
 * (live D1 path before children enrichment), and present once CRM/household children
 * attach into QueueRowContext — not a CSS/clipping issue.
 */

import { describe, expect, it } from "vitest";
import { resolveCompactSecondaryBand } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { attachPartialQueueRowContext } from "@/lib/workUnits/buildPartialQueueRowContext";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

function secondaryConfig(): QueueRecordLayoutConfigV3 {
    return {
        version: 3,
        variant: "operational-row",
        fixedControls: { actionsMenu: true, workWithBos: true, actionRailStyle: "stacked" },
        columns: [
            {
                id: "secondary",
                label: "Secondary",
                width: "medium",
                scope: { type: "main_record" },
                builderSlot: "groupCount",
                rowIndex: 2,
                blocks: [
                    {
                        type: "field_group",
                        id: "g1",
                        fields: [
                            {
                                id: "names",
                                fieldKey: "children.names",
                                label: "Children names",
                                display: "text",
                            },
                            {
                                id: "count",
                                fieldKey: "children.count",
                                label: "Children count",
                                display: "text",
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe("live Secondary absence root cause", () => {
    it("returns null Secondary when related_subjects_summary is empty (values absent before render)", () => {
        const mapped = mapQueueRowSurfaceToCompactConfig(secondaryConfig());
        const emptyCtx = {
            contract_version: "1.1-partial",
            row_subject: {
                subject_type: "case",
                subject_id: "opp-wenc",
                display_name: "Wenc Family",
            },
            related_subjects_summary: [],
        };

        const band = resolveCompactSecondaryBand(emptyCtx, mapped.slots.groupCount, {
            publishedAuthority: true,
        });
        expect(band).toBeNull();
        expect(mapped.slots.groupCount.fieldKeys).toEqual(["children.names", "children.count"]);
    });

    it("builds related_subjects from _crm_compact_children so Secondary resolves", () => {
        const mapped = mapQueueRowSurfaceToCompactConfig(secondaryConfig());
        const row = attachPartialQueueRowContext(
            {
                id: "opp-wenc",
                name: "Wenc Family",
                status_key: "open",
                _crm_compact_children: [
                    { primary: "Blake Wenc", secondary: null, customerMemberId: "cm-blake" },
                    { primary: "Jarek Wenc", secondary: null, customerMemberId: "cm-jarek" },
                ],
            },
            { key: "new_leads", label: "New Leads" },
        );
        const ctx = row._queue_row_context as QueueRowContext;
        expect(ctx.related_subjects_summary?.length).toBe(2);

        const band = resolveCompactSecondaryBand(ctx, mapped.slots.groupCount, {
            publishedAuthority: true,
        });
        expect(band?.left).toContain("Blake");
        expect(band?.left).toContain("Jarek");
        expect(band?.right).toMatch(/2/);
    });
});

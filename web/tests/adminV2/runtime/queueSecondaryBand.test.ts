/**
 * CondensedQueueRow Secondary band — left/right from groupCount fieldKeys.
 */

import { describe, expect, it } from "vitest";
import { resolveCompactSecondaryBand } from "@/lib/presentation/runtime/resolveCompactSlotDisplay";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

function makeConfig(): QueueRecordLayoutConfigV3 {
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

function makeContext(): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: {
            subject_type: "case",
            subject_id: "opp-1",
            display_name: "Wenc Family",
        },
        row_stage: "inquiry",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "Open",
        case_context: {
            case_id: "opp-1",
            display_name: "Wenc Family",
            case_type_label: "Enrollment",
            case_status_key: "open",
            case_status_label: "Open",
        },
        related_subjects_summary: [
            {
                subject_type: "child",
                subject_id: "c1",
                display_name: "Blake Wenc",
                status_label: "",
                age_label: "3",
            },
            {
                subject_type: "child",
                subject_id: "c2",
                display_name: "Jarek Wenc",
                status_label: "",
                age_label: "4",
            },
        ],
    };
}

describe("queue Secondary band", () => {
    it("maps Secondary builderSlot groupCount with names + count fieldKeys", () => {
        const mapped = mapQueueRowSurfaceToCompactConfig(makeConfig());
        expect(mapped.slots.groupCount.visible).toBe(true);
        expect(mapped.slots.groupCount.fieldKeys).toEqual(["children.names", "children.count"]);
    });

    it("resolves left names and right count (does not join into one chip)", () => {
        const mapped = mapQueueRowSurfaceToCompactConfig(makeConfig());
        const band = resolveCompactSecondaryBand(makeContext(), mapped.slots.groupCount, {
            publishedAuthority: true,
        });
        expect(band?.left).toContain("Blake");
        expect(band?.left).toContain("Jarek");
        expect(band?.right).toMatch(/2/);
        expect(band?.left).not.toEqual(band?.right);
    });

    it("keeps names alone when count is removed", () => {
        const config = makeConfig();
        const fields = (config.columns[0]!.blocks[0] as { fields: unknown[] }).fields;
        (config.columns[0]!.blocks[0] as { fields: unknown[] }).fields = [fields[0]!];
        const mapped = mapQueueRowSurfaceToCompactConfig(config);
        const band = resolveCompactSecondaryBand(makeContext(), mapped.slots.groupCount, {
            publishedAuthority: true,
        });
        expect(band?.left).toContain("Blake");
        expect(band?.right).toBeNull();
    });
});

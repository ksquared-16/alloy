/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emptyQueueRowLayoutV3 } from "@/lib/layout/queueRecordLayoutDefaults";
import {
    buildConfigFromState,
    buildCatalog,
    stateFromConfig,
} from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";
import {
    buildColumnsFromPlacedFields,
    ingestConfigIntoZoneState,
    listPlacedFields,
    movePlacedField,
    placedFieldId,
    type ZoneComposerState,
} from "@/lib/adminV2/settings/surfaces/queueRowComposerModel";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import { previewRowModelFromConfig } from "@/lib/adminV2/settings/surfaces/queueRowBuilderPreview";
import {
    placementRegistryGaps,
    sortKeyToVariantSort,
} from "@/lib/adminV2/settings/surfaces/queueRowVariantDisplayControls";

const builderSrc = readFileSync(
    fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx", import.meta.url)),
    "utf8",
);
const composerSrc = readFileSync(
    fileURLToPath(new URL("../../lib/adminV2/settings/surfaces/surfaceFieldComposer.ts", import.meta.url)),
    "utf8",
);
const variantInspectorSrc = readFileSync(
    fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowVariantInspector.tsx", import.meta.url)),
    "utf8",
);

function enableFields(
    zones: ReturnType<typeof stateFromConfig>,
    zoneKey: "children" | "status",
    specs: { fieldKey: string; label: string; builderSlot: "identity" | "groupCount" | "status"; stackLine: number; inlineWithPrevious?: boolean }[],
) {
    return zones.map((z) => {
        if (z.key !== zoneKey) return z;
        return {
            ...z,
            inRow: true,
            canvasSlot: specs[0]?.builderSlot ?? z.canvasSlot,
            fieldOrder: specs.map((s) => s.fieldKey),
            fieldPlacements: Object.fromEntries(
                specs.map((s) => [
                    s.fieldKey,
                    {
                        builderSlot: s.builderSlot,
                        stackLine: s.stackLine,
                        inlineWithPrevious: s.inlineWithPrevious ?? false,
                    },
                ]),
            ),
            evidenceGroups: z.evidenceGroups.map((g) => ({
                ...g,
                enabled: true,
                fields: g.fields.map((f) => {
                    const spec = specs.find((s) => s.fieldKey === f.fieldKey);
                    return spec ? { ...f, enabled: true, label: spec.label } : f;
                }),
            })),
        };
    });
}

describe("queue row composer model", () => {
    it("builder exposes field selection, inspector, and single add affordance per region", () => {
        expect(composerSrc).toContain("data-canvas-field");
        expect(builderSrc).toContain("data-field-inspector");
        expect(composerSrc).toContain("data-canvas-add-field");
        expect(builderSrc).not.toContain("data-canvas-add-same-line");
        expect(builderSrc).not.toContain("data-canvas-add-below");
        expect(builderSrc).toContain("FieldInspector");
        expect(builderSrc).toContain("data-inspector-field-list");
    });

    it("variant inspector exposes group by, sort by, and waitlist placement config", () => {
        expect(variantInspectorSrc).toContain('testId="queue-row-variant-group-by"');
        expect(variantInspectorSrc).toContain('testId="queue-row-variant-sort-by"');
        expect(variantInspectorSrc).toContain("QueueRowPlacementRankingEditor");
        expect(variantInspectorSrc).toContain("QueueRowOrderedCriteriaEditor");
        expect(sortKeyToVariantSort("waitlist_rank")?.key).toBe("waitlist.position");
    });

    it("supports multiple fields in Primary with order and inline grouping", () => {
        const catalog = buildCatalog(false);
        const base = emptyQueueRowLayoutV3();
        let zones = stateFromConfig(base, catalog, false);
        zones = enableFields(zones, "children", [
            { fieldKey: "child.name", label: "Full name", builderSlot: "identity", stackLine: 0 },
            { fieldKey: "child.date_of_birth", label: "DOB", builderSlot: "identity", stackLine: 0, inlineWithPrevious: true },
            { fieldKey: "child.status", label: "Disposition", builderSlot: "identity", stackLine: 1 },
        ]);

        const placed = listPlacedFields(zones);
        expect(placed).toHaveLength(3);
        expect(placed.map((f) => f.fieldKey)).toEqual(["child.name", "child.date_of_birth", "child.status"]);

        const config = buildConfigFromState(base, zones, catalog);
        expect(config.columns.length).toBeGreaterThanOrEqual(2);

        const identityCols = config.columns.filter((c) => c.builderSlot === "identity");
        expect(
            identityCols.some((c) => {
                const block = c.blocks[0];
                return (
                    (block?.type === "field_group" || block?.type === "repeated_record_block") &&
                    block.fields.length >= 2
                );
            }),
        ).toBe(true);
        expect(identityCols.some((c) => c.rowIndex === 1)).toBe(true);

        const compact = mapQueueRowSurfaceToCompactConfig(config);
        expect(compact.slots.subject.label).toContain("Full name");
        expect(compact.slots.subject.label).toContain("DOB");

        const roundTrip = stateFromConfig(config, catalog, false);
        const roundPlaced = listPlacedFields(roundTrip);
        expect(roundPlaced.map((f) => f.fieldKey)).toEqual(["child.name", "child.date_of_birth", "child.status"]);
    });

    it("moves a field from Primary to Secondary via inspector model", () => {
        const catalog = buildCatalog(false);
        const base = emptyQueueRowLayoutV3();
        let zones = enableFields(stateFromConfig(base, catalog, false), "children", [
            { fieldKey: "child.name", label: "Full name", builderSlot: "identity", stackLine: 0 },
        ]);

        const fieldId = placedFieldId("children", zones.find((z) => z.key === "children")!.evidenceGroups[0]!.blockId, "child.name");
        zones = movePlacedField(zones as import("@/lib/adminV2/settings/surfaces/queueRowComposerModel").ZoneComposerState[], fieldId, { builderSlot: "groupCount" }) as ReturnType<typeof stateFromConfig>;

        const moved = listPlacedFields(zones).find((f) => f.fieldKey === "child.name");
        expect(moved?.builderSlot).toBe("groupCount");

        const config = buildConfigFromState(base, zones, catalog);
        expect(config.columns.some((c) => c.builderSlot === "groupCount")).toBe(true);
        expect(mapQueueRowSurfaceToCompactConfig(config).slots.groupCount.label).toContain("Full name");
    });

    it("waitlist rank and placement adjustment can share the Right area", () => {
        const catalog = buildCatalog(true);
        const base = emptyQueueRowLayoutV3();
        let zones = enableFields(stateFromConfig(base, catalog, true), "status", [
            { fieldKey: "waitlist.positionLabel", label: "Waitlist rank", builderSlot: "status", stackLine: 0 },
            { fieldKey: "overrides.flags", label: "Placement adjustment", builderSlot: "status", stackLine: 0, inlineWithPrevious: true },
        ]);

        const config = buildConfigFromState(base, zones, catalog);
        const statusCols = config.columns.filter((c) => c.builderSlot === "status");
        expect(statusCols.length).toBeGreaterThanOrEqual(1);
        expect(mapQueueRowSurfaceToCompactConfig(config).slots.status.label).toContain("Position");
        expect(mapQueueRowSurfaceToCompactConfig(config).slots.status.label).toContain("Override");
    });

    it("preview joins multi-field Primary labels", () => {
        const catalog = buildCatalog(false);
        const base = emptyQueueRowLayoutV3();
        const zones = enableFields(stateFromConfig(base, catalog, false), "children", [
            { fieldKey: "child.name", label: "Full name", builderSlot: "identity", stackLine: 0 },
            { fieldKey: "child.date_of_birth", label: "DOB", builderSlot: "identity", stackLine: 0, inlineWithPrevious: true },
        ]);
        const config = buildConfigFromState(base, zones, catalog);
        const preview = previewRowModelFromConfig(config);
        expect(preview.context?.row_subject.display_name).toContain("Full name");
        expect(preview.context?.row_subject.display_name).toContain("DOB");
    });

    it("documents placement registry gaps for waitlist", () => {
        const gaps = placementRegistryGaps(true);
        expect(gaps).toContain("opportunity.offer_status");
    });
});

/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PlacedFieldRef } from "@/lib/adminV2/settings/surfaces/queueRowComposerModel";
import {
    composerCardHeightPx,
    fieldChipHitBoxes,
    fieldChipLayoutsDoNotOverlap,
    groupFieldsByStackLine,
    MAX_FIELDS_PER_LINE,
    regionLayoutMetrics,
    REGION_ANCHOR,
    resolveDefaultAppendPlacement,
} from "@/lib/adminV2/settings/surfaces/queueRowComposerCanvasLayout";

import {
    SURFACE_FIELD_INSPECTOR_ATTRS,
    SURFACE_FIELD_PLACEMENT_HELP,
} from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";

const builderSrc = readFileSync(
    fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowBuilderV2.tsx", import.meta.url)),
    "utf8",
);
const editorSrc = readFileSync(
    fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowSurfaceEditor.tsx", import.meta.url)),
    "utf8",
);
const variantSettingsSrc = readFileSync(
    fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowVariantSettings.tsx", import.meta.url)),
    "utf8",
);
const variantInspectorSrc = readFileSync(
    fileURLToPath(new URL("../../components/adminV2/settings/surfaces/QueueRowVariantInspector.tsx", import.meta.url)),
    "utf8",
);

function field(
    partial: Partial<PlacedFieldRef> & Pick<PlacedFieldRef, "fieldKey" | "label" | "builderSlot">,
): PlacedFieldRef {
    return {
        id: partial.id ?? `id:${partial.fieldKey}`,
        zoneKey: partial.zoneKey ?? "children",
        blockId: partial.blockId ?? "block",
        kind: partial.kind ?? "field",
        stackLine: partial.stackLine ?? 0,
        inlineWithPrevious: partial.inlineWithPrevious ?? false,
        ...partial,
    };
}

describe("queue row composer canvas layout", () => {
    it("builder uses calm single add affordance per region", () => {
        expect(builderSrc).toContain("ComposerFieldChip");
        expect(builderSrc).toContain("ComposerRegionOverlay");
        expect(builderSrc).toContain("data-canvas-line");
        expect(builderSrc).toContain("SURFACE_FIELD_INSPECTOR_ATTRS.canvasAddField");
        expect(builderSrc).not.toContain("+ Add next to this");
        expect(builderSrc).not.toContain("opacity-[0.22]");
        expect(builderSrc).toContain("blankPreviewRowModel()");
        expect(builderSrc).toContain("data-inspector-field-list");
    });

    it("inspector lists all fields on the row and supports selection", () => {
        expect(builderSrc).toContain("data-inspector-field-list");
        expect(builderSrc).toContain("Fields on this row");
        expect(builderSrc).toContain("data-inspector-field-row");
    });

    it("groups same-line and below fields into separate visual lines", () => {
        const fields = [
            field({ fieldKey: "child.name", label: "Child name", builderSlot: "identity", stackLine: 0 }),
            field({
                fieldKey: "child.date_of_birth",
                label: "DOB",
                builderSlot: "identity",
                stackLine: 1,
            }),
            field({
                fieldKey: "inquiry_child.program_category",
                label: "Program",
                builderSlot: "identity",
                stackLine: 1,
                inlineWithPrevious: true,
            }),
        ];
        const lines = groupFieldsByStackLine(fields);
        expect(lines).toHaveLength(2);
        expect(lines[0]?.map((f) => f.fieldKey)).toEqual(["child.name"]);
        expect(lines[1]?.map((f) => f.fieldKey)).toEqual(["child.date_of_birth", "inquiry_child.program_category"]);
    });

    it("wraps visual lines at max 3 fields per line", () => {
        const fields = [
            field({ fieldKey: "a", label: "A", builderSlot: "identity", stackLine: 0 }),
            field({ fieldKey: "b", label: "B", builderSlot: "identity", stackLine: 0, inlineWithPrevious: true }),
            field({ fieldKey: "c", label: "C", builderSlot: "identity", stackLine: 0, inlineWithPrevious: true }),
            field({ fieldKey: "d", label: "D", builderSlot: "identity", stackLine: 0, inlineWithPrevious: true }),
        ];
        const lines = groupFieldsByStackLine(fields);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toHaveLength(MAX_FIELDS_PER_LINE);
        expect(lines[1]).toHaveLength(1);
    });

    it("fourth field append defaults to new line when line is full", () => {
        const regionFields = [
            field({ fieldKey: "a", label: "A", builderSlot: "identity", stackLine: 0 }),
            field({ fieldKey: "b", label: "B", builderSlot: "identity", stackLine: 0, inlineWithPrevious: true }),
            field({ fieldKey: "c", label: "C", builderSlot: "identity", stackLine: 0, inlineWithPrevious: true }),
        ];
        expect(resolveDefaultAppendPlacement(regionFields)).toEqual({
            stackLine: 1,
            inlineWithPrevious: false,
        });
    });

    it("append stays on same line when fewer than 3 fields", () => {
        const regionFields = [
            field({ fieldKey: "a", label: "A", builderSlot: "identity", stackLine: 0 }),
            field({ fieldKey: "b", label: "B", builderSlot: "identity", stackLine: 0, inlineWithPrevious: true }),
        ];
        expect(resolveDefaultAppendPlacement(regionFields)).toEqual({
            stackLine: 0,
            inlineWithPrevious: true,
        });
    });

    it("allocates non-overlapping chip hit boxes per field", () => {
        const fields = [
            field({ fieldKey: "child.name", label: "Child name", builderSlot: "identity", stackLine: 0 }),
            field({ fieldKey: "child.date_of_birth", label: "DOB", builderSlot: "identity", stackLine: 1 }),
            field({ fieldKey: "child.status", label: "Program", builderSlot: "identity", stackLine: 1, inlineWithPrevious: true }),
        ];
        expect(fieldChipLayoutsDoNotOverlap(fields)).toBe(true);
        const boxes = fieldChipHitBoxes("identity", fields);
        expect(boxes).toHaveLength(3);
        expect(new Set(boxes.map((b) => b.topPx)).size).toBe(2);
    });

    it("expands card height when multiple lines are placed", () => {
        const map = new Map([
            [
                "identity" as const,
                [
                    field({ fieldKey: "child.name", label: "Child name", builderSlot: "identity", stackLine: 0 }),
                    field({ fieldKey: "child.date_of_birth", label: "DOB", builderSlot: "identity", stackLine: 1 }),
                ],
            ],
        ]);
        const metrics = regionLayoutMetrics("identity", map.get("identity") ?? []);
        expect(metrics.lines).toHaveLength(2);
        expect(metrics.totalHeightPx).toBeGreaterThan(REGION_ANCHOR.identity.minHeightPx);
        expect(composerCardHeightPx(map)).toBeGreaterThanOrEqual(88);
    });

    it("status region fits waitlist rank + placement adjustment on one line", () => {
        const statusFields = [
            field({ fieldKey: "waitlist.positionLabel", label: "Waitlist rank", builderSlot: "status", zoneKey: "status" }),
            field({
                fieldKey: "overrides.flags",
                label: "Placement adjustment",
                builderSlot: "status",
                zoneKey: "status",
                inlineWithPrevious: true,
            }),
        ];
        const lines = groupFieldsByStackLine(statusFields);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toHaveLength(2);
    });
});

describe("queue row surface editor layout", () => {
    it("renders variant group/sort settings below the row canvas", () => {
        expect(editorSrc).toContain("QueueRowVariantSettings");
        expect(variantSettingsSrc).toContain('data-testid="queue-row-variant-settings-below"');
        expect(editorSrc).not.toContain("QueueRowVariantInspector");
        expect(variantSettingsSrc).toContain('testId="queue-row-variant-group-by"');
        expect(variantSettingsSrc).toContain('testId="queue-row-variant-sort-by"');
    });

    it("placement ranking UI is not shown in the queue row builder shell", () => {
        expect(editorSrc).not.toContain("QueueRowPlacementRankingEditor");
        expect(builderSrc).not.toContain("QueueRowPlacementRankingEditor");
        expect(variantSettingsSrc).not.toContain("QueueRowPlacementRankingEditor");
        expect(variantInspectorSrc).toContain("QueueRowPlacementRankingEditor");
    });
});

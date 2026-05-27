import { describe, expect, it } from "vitest";
import {
    addCompositionBlock,
    addFieldIdToRegion,
    buildDefaultDocumentComposition,
    canRemoveFieldRegion,
    flattenFieldIdsFromComposition,
    listFieldRegionBlocks,
    moveCompositionBlock,
    moveFieldInRegion,
    moveFieldToRegion,
    patchSchemaComposition,
    removeCompositionBlock,
} from "@/lib/forms/documentCompositionAuthoring";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const baseSchema: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment",
    sections: [{ id: "main", title: "Details", field_ids: ["f1", "f2", "f3"] }],
    fields: [
        { id: "f1", type: "text", label: "First", required: true },
        { id: "f2", type: "text", label: "Second", required: false },
        { id: "f3", type: "text", label: "Third", required: false },
    ],
};

describe("documentCompositionUsability FD-13", () => {
    it("supports multiple field regions in composition", () => {
        const defaultComp = buildDefaultDocumentComposition(baseSchema);
        const withSecond = addCompositionBlock(defaultComp, {
            id: "region-2",
            type: "field_region",
            title: "Additional questions",
            helper: "Optional follow-up",
            layout: "two_column",
            field_ids: [],
            order: defaultComp.blocks.length,
        });

        const regions = listFieldRegionBlocks(withSecond);
        expect(regions).toHaveLength(2);
        expect(regions[1]?.title).toBe("Additional questions");
        expect(regions[1]?.layout).toBe("two_column");
    });

    it("orders sections via moveCompositionBlock", () => {
        const comp = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                { id: "r1", type: "field_region", title: "A", field_ids: ["f1"], order: 0 },
                { id: "r2", type: "field_region", title: "B", field_ids: ["f2"], order: 1 },
            ],
        }).document_composition!;

        const moved = moveCompositionBlock(comp, "r2", -1);
        const titles = listFieldRegionBlocks(moved).map((r) => r.title);
        expect(titles).toEqual(["B", "A"]);
    });

    it("assigns and moves fields between regions", () => {
        const comp = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                { id: "r1", type: "field_region", title: "Primary", field_ids: ["f1", "f2"], order: 0 },
                { id: "r2", type: "field_region", title: "Secondary", field_ids: ["f3"], order: 1 },
            ],
        }).document_composition!;

        const moved = moveFieldToRegion(comp, "f2", "r2");
        const r1 = listFieldRegionBlocks(moved).find((r) => r.id === "r1");
        const r2 = listFieldRegionBlocks(moved).find((r) => r.id === "r2");
        expect(r1?.field_ids).toEqual(["f1"]);
        expect(r2?.field_ids).toEqual(["f3", "f2"]);
    });

    it("reorders fields within a region", () => {
        const comp = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [{ id: "r1", type: "field_region", field_ids: ["f1", "f2", "f3"], order: 0 }],
        }).document_composition!;

        const moved = moveFieldInRegion(comp, "r1", "f3", -1);
        const region = listFieldRegionBlocks(moved)[0];
        expect(region?.field_ids).toEqual(["f1", "f3", "f2"]);
    });

    it("flattens field ids from all regions for schema sync", () => {
        const comp = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                { id: "r1", type: "field_region", field_ids: ["f2"], order: 0 },
                { id: "r2", type: "field_region", field_ids: ["f1", "f3"], order: 1 },
            ],
        }).document_composition!;

        expect(flattenFieldIdsFromComposition(comp, baseSchema)).toEqual(["f2", "f1", "f3"]);
    });

    it("allows removing empty sections only", () => {
        const block = {
            id: "empty",
            type: "field_region" as const,
            title: "Empty",
            field_ids: [] as string[],
            order: 0,
        };
        expect(canRemoveFieldRegion(block)).toBe(true);

        const comp = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [block, { id: "r2", type: "field_region", field_ids: ["f1"], order: 1 }],
        }).document_composition!;

        const next = removeCompositionBlock(comp, "empty");
        expect(listFieldRegionBlocks(next)).toHaveLength(1);
    });

    it("adds new fields to a specific region", () => {
        const comp = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                { id: "r1", type: "field_region", field_ids: ["f1"], order: 0 },
                { id: "r2", type: "field_region", field_ids: ["f2"], order: 1 },
            ],
        }).document_composition!;

        const next = addFieldIdToRegion(comp, "r2", "f3");
        const r2 = listFieldRegionBlocks(next).find((r) => r.id === "r2");
        expect(r2?.field_ids).toContain("f3");
        expect(listFieldRegionBlocks(next).find((r) => r.id === "r1")?.field_ids).not.toContain("f3");
    });
});

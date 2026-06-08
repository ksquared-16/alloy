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
    resolveDocumentComposition,
} from "@/lib/forms/documentCompositionAuthoring";
import { emptyFormSchema } from "@/lib/forms/adminFormSchemaBuilder";
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
                { id: "r1", type: "field_region", layout: "one_column", title: "A", field_ids: ["f1"], order: 0 },
                { id: "r2", type: "field_region", layout: "one_column", title: "B", field_ids: ["f2"], order: 1 },
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
                { id: "r1", type: "field_region", layout: "one_column", title: "Primary", field_ids: ["f1", "f2"], order: 0 },
                { id: "r2", type: "field_region", layout: "one_column", title: "Secondary", field_ids: ["f3"], order: 1 },
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
            blocks: [{ id: "r1", type: "field_region", layout: "one_column", field_ids: ["f1", "f2", "f3"], order: 0 }],
        }).document_composition!;

        const moved = moveFieldInRegion(comp, "r1", "f3", -1);
        const region = listFieldRegionBlocks(moved)[0];
        expect(region?.field_ids).toEqual(["f1", "f3", "f2"]);
    });

    it("flattens field ids from all regions for schema sync", () => {
        const comp = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                { id: "r1", type: "field_region", layout: "one_column", field_ids: ["f2"], order: 0 },
                { id: "r2", type: "field_region", layout: "one_column", field_ids: ["f1", "f3"], order: 1 },
            ],
        }).document_composition!;

        expect(flattenFieldIdsFromComposition(comp, baseSchema)).toEqual(["f2", "f1", "f3"]);
    });

    it("allows removing empty sections only", () => {
        const block = {
            id: "empty",
            type: "field_region" as const,
            layout: "one_column" as const,
            title: "Empty",
            field_ids: [] as string[],
            order: 0,
        };
        expect(canRemoveFieldRegion(block)).toBe(true);

        const comp = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [block, { id: "r2", type: "field_region", layout: "one_column", field_ids: ["f1"], order: 1 }],
        }).document_composition!;

        const next = removeCompositionBlock(comp, "empty");
        expect(listFieldRegionBlocks(next)).toHaveLength(1);
    });

    it("adds new fields to a specific region", () => {
        const comp = patchSchemaComposition(baseSchema, {
            version: 1,
            blocks: [
                { id: "r1", type: "field_region", layout: "one_column", field_ids: ["f1"], order: 0 },
                { id: "r2", type: "field_region", layout: "one_column", field_ids: ["f2"], order: 1 },
            ],
        }).document_composition!;

        const next = addFieldIdToRegion(comp, "r2", "f3");
        const r2 = listFieldRegionBlocks(next).find((r) => r.id === "r2");
        expect(r2?.field_ids).toEqual(["f2", "f3"]);
        expect(listFieldRegionBlocks(next).find((r) => r.id === "r1")?.field_ids).not.toContain("f3");
    });

    it("appends fields in add order when simulating sequential add-question (A B C D)", () => {
        let schema = emptyFormSchema("Order test") as FormSchemaV1;
        let composition = resolveDocumentComposition(schema);
        const regionId = listFieldRegionBlocks(composition)[0]!.id;
        const labels = ["A", "B", "C", "D"];

        for (const label of labels) {
            const f = {
                id: `field_${label.toLowerCase()}`,
                type: "text" as const,
                label,
                required: false,
                field_source: { entity_type: "custom" as const, field_key: "unmapped" },
            };
            const sec0 = schema.sections[0]!;
            composition = addFieldIdToRegion(composition, regionId, f.id);
            schema = patchSchemaComposition(
                {
                    ...schema,
                    fields: [...schema.fields, f],
                    sections: [{ ...sec0, field_ids: [...sec0.field_ids, f.id] }],
                },
                composition
            );
            composition = schema.document_composition ?? composition;
        }

        const region = listFieldRegionBlocks(composition)[0];
        expect(region?.field_ids).toEqual(["field_a", "field_b", "field_c", "field_d"]);
        expect(schema.sections[0]?.field_ids).toEqual(["field_a", "field_b", "field_c", "field_d"]);
    });
});

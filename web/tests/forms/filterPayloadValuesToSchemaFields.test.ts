import { describe, expect, it } from "vitest";
import { filterPayloadValuesToSchemaFields } from "@/lib/forms/filterPayloadValuesToSchema";

const minimalSchema = {
    schema_version: 1 as const,
    title: "T",
    sections: [] as { id: string; field_ids: string[] }[],
    fields: [
        { id: "keep", type: "text" as const, label: "Keep", required: false },
        { id: "g", type: "group" as const, label: "G", required: false, fields: [] },
    ],
};

describe("filterPayloadValuesToSchemaFields", () => {
    it("drops values for ids not in the schema (e.g. removed field after republish)", () => {
        const out = filterPayloadValuesToSchemaFields(minimalSchema, {
            keep: "a",
            removed_field: "stale",
        });
        expect(out).toEqual({ keep: "a" });
        expect("removed_field" in out).toBe(false);
    });
});

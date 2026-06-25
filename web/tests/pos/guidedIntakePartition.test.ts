import { describe, it, expect } from "vitest";
import { buildGuidedIntakePartition, subSchemaForFields } from "@/lib/forms/guidedIntakePartition";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

function f(id: string, type: FormField["type"] = "text", required = false): FormField {
    return { id, label: id, required, type } as FormField;
}

const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment",
    sections: [{ id: "s", field_ids: ["child_name", "dob", "allergies", "immun", "sig"] }],
    fields: [f("child_name", "text", true), f("dob", "date", true), f("allergies", "text"), f("immun", "file_ref", true), f("sig", "signature", true)],
};

describe("buildGuidedIntakePartition", () => {
    it("splits known / missing / uploads", () => {
        const p = buildGuidedIntakePartition(schema, { child_name: "Ada", dob: "2018-01-01" });
        expect(p.known.map((k) => k.id)).toEqual(["child_name", "dob"]);
        expect(p.missing.map((m) => m.id)).toEqual(["allergies"]);
        expect(p.uploads.map((u) => u.id)).toEqual(["immun", "sig"]);
        expect(p.counts).toEqual({ known: 2, missing: 1, uploads: 2, requiredMissing: 0 });
    });

    it("orders stages and includes only non-empty content stages", () => {
        const p = buildGuidedIntakePartition(schema, { child_name: "Ada", dob: "2018-01-01" });
        expect(p.stages).toEqual(["welcome", "review_known", "fill_missing", "uploads", "review", "submit"]);
    });

    it("drops review_known when nothing is known and fill_missing when nothing missing", () => {
        const allMissing = buildGuidedIntakePartition(schema, {});
        expect(allMissing.stages).toEqual(["welcome", "fill_missing", "uploads", "review", "submit"]);

        const noScalarMissing = buildGuidedIntakePartition(schema, { child_name: "Ada", dob: "2018-01-01", allergies: "none" });
        expect(noScalarMissing.stages).toEqual(["welcome", "review_known", "uploads", "review", "submit"]);
    });

    it("counts required missing scalars", () => {
        const p = buildGuidedIntakePartition(schema, { allergies: "none" });
        // child_name + dob are required and missing
        expect(p.counts.requiredMissing).toBe(2);
    });
});

describe("subSchemaForFields", () => {
    it("builds a valid one-section schema with only the requested fields, order preserved", () => {
        const sub = subSchemaForFields(schema, ["dob", "child_name"], "Confirm");
        expect(sub.fields.map((x) => x.id)).toEqual(["child_name", "dob"]); // source order
        expect(sub.sections).toHaveLength(1);
        expect(sub.sections[0].field_ids).toEqual(["child_name", "dob"]);
        expect(sub.title).toBe("Confirm");
        expect(sub.schema_version).toBe(1);
    });
});

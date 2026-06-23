import { describe, it, expect } from "vitest";
import {
    buildFamilyGuidedPlan,
    assembleFamilySubmissionPayload,
    detectFamilyChildren,
    isFamilyIntake,
    seedFamilyChildSlices,
    omitChildFields,
} from "@/lib/forms/familyGuidedPlan";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

function f(id: string, type: FormField["type"], src?: { entity_type: string; field_key: string }): FormField {
    return { id, label: id, required: false, type, ...(src ? { field_source: src } : {}) } as FormField;
}
const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment",
    sections: [{ id: "s", field_ids: ["parent_email", "address", "child_name", "allergies", "sig"] }],
    fields: [
        f("parent_email", "text", { entity_type: "person", field_key: "email" }),
        f("address", "text", { entity_type: "customer", field_key: "address" }),
        f("child_name", "text", { entity_type: "customer_member", field_key: "child_name" }),
        f("allergies", "text", { entity_type: "customer_member", field_key: "allergies" }),
        f("sig", "signature"),
    ],
};

describe("buildFamilyGuidedPlan", () => {
    it("household once → one child step per child → signatures", () => {
        const plan = buildFamilyGuidedPlan(schema, [
            { customer_member_id: "mck", label: "McKenzie" },
            { customer_member_id: "emy", label: "Emyrson" },
        ]);
        expect(plan.steps.map((s) => s.kind)).toEqual(["household", "child", "child", "signature"]);
        expect(plan.steps[0].fieldIds).toEqual(["parent_email", "address"]);
        // each child step renders the same child fields, labeled per child
        expect(plan.steps[1].title).toBe("About McKenzie");
        expect(plan.steps[1].fieldIds).toEqual(["child_name", "allergies"]);
        expect(plan.steps[2].title).toBe("About Emyrson");
        expect(plan.steps[2].child?.customer_member_id).toBe("emy");
        expect(plan.steps[3].fieldIds).toEqual(["sig"]);
    });

    it("skips empty scopes (no child fields → no child steps)", () => {
        const householdOnly: FormSchemaV1 = { ...schema, fields: schema.fields.filter((x) => x.id === "parent_email"), sections: [{ id: "s", field_ids: ["parent_email"] }] };
        const plan = buildFamilyGuidedPlan(householdOnly, [{ customer_member_id: "mck" }, { customer_member_id: "emy" }]);
        expect(plan.steps.map((s) => s.kind)).toEqual(["household"]);
    });
});

describe("detectFamilyChildren / isFamilyIntake", () => {
    it("reads selected_customer_member_ids (+ labels) from launch_context", () => {
        const refs = detectFamilyChildren({
            selected_customer_member_ids: ["mck", "emy", "mck"],
            selected_customer_member_labels: { mck: "McKenzie", emy: "Emyrson" },
        });
        expect(refs).toEqual([
            { customer_member_id: "mck", label: "McKenzie" },
            { customer_member_id: "emy", label: "Emyrson" },
        ]);
    });
    it("returns [] when not a family launch", () => {
        expect(detectFamilyChildren({})).toEqual([]);
        expect(detectFamilyChildren(null)).toEqual([]);
    });
    it("family intake requires >1 child AND child fields (preserves single-child behavior)", () => {
        expect(isFamilyIntake([{ customer_member_id: "a" }, { customer_member_id: "b" }], ["child_name"])).toBe(true);
        expect(isFamilyIntake([{ customer_member_id: "a" }], ["child_name"])).toBe(false); // single child → existing flow
        expect(isFamilyIntake([{ customer_member_id: "a" }, { customer_member_id: "b" }], [])).toBe(false); // no child fields
    });
});

describe("seedFamilyChildSlices / omitChildFields", () => {
    it("seeds the FIRST child from prefilled child values; siblings empty", () => {
        const slices = seedFamilyChildSlices(
            [{ customer_member_id: "mck" }, { customer_member_id: "emy" }],
            ["child_name", "dob"],
            { child_name: "McKenzie", dob: "2018-01-01", parent_email: "p@x.com" }
        );
        expect(slices.mck).toEqual({ child_name: "McKenzie", dob: "2018-01-01" }); // prefill, child fields only
        expect(slices.emy).toEqual({}); // sibling starts blank
    });
    it("base values exclude child-scoped fields", () => {
        expect(omitChildFields({ parent_email: "p@x", child_name: "M", dob: "x" }, ["child_name", "dob"])).toEqual({ parent_email: "p@x" });
    });
});

describe("assembleFamilySubmissionPayload", () => {
    it("puts first child's answers in canonical values, all children in meta.family", () => {
        const out = assembleFamilySubmissionPayload({
            baseValues: { parent_email: "a@b.com", address: "1 St" },
            childAnswers: [
                { customer_member_id: "mck", label: "McKenzie", values: { child_name: "McKenzie", allergies: "Peanuts" } },
                { customer_member_id: "emy", label: "Emyrson", values: { child_name: "Emyrson", allergies: "None" } },
            ],
            childFieldIds: ["child_name", "allergies"],
        });
        // canonical values: household + FIRST child
        expect(out.values).toEqual({ parent_email: "a@b.com", address: "1 St", child_name: "McKenzie", allergies: "Peanuts" });
        // every child's answers preserved in meta (sibling not lost)
        const fam = out.meta.family as { children: Array<{ customer_member_id: string; values: Record<string, unknown> }>; canonical_child_id: string };
        expect(fam.children).toHaveLength(2);
        expect(fam.children[1]).toMatchObject({ customer_member_id: "emy", values: { child_name: "Emyrson", allergies: "None" } });
        expect(fam.canonical_child_id).toBe("mck");
    });

    it("only child-scoped keys are kept per child (strips stray keys)", () => {
        const out = assembleFamilySubmissionPayload({
            baseValues: {},
            childAnswers: [{ customer_member_id: "mck", values: { child_name: "M", parent_email: "leak@x.com" } }],
            childFieldIds: ["child_name"],
        });
        const fam = out.meta.family as { children: Array<{ values: Record<string, unknown> }> };
        expect(fam.children[0].values).toEqual({ child_name: "M" });
        expect(out.values).toEqual({ child_name: "M" });
    });
});

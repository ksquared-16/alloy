import { describe, it, expect } from "vitest";
import { buildGuidedQuestionPlan, mirrorCanonicalValues } from "@/lib/forms/guidedQuestionPlan";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

function f(id: string, opts: { type?: FormField["type"]; required?: boolean; et?: string; fk?: string; svk?: string } = {}): FormField {
    const { type = "text", required = false, et, fk, svk } = opts;
    return {
        id,
        label: id,
        required,
        type,
        ...(et && fk ? { field_source: { entity_type: et, field_key: fk, ...(svk ? { shared_value_key: svk } : {}) } } : {}),
    } as FormField;
}

const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Enrollment",
    sections: [
        { id: "child", title: "Child", field_ids: ["child_name", "dob", "allergies"] },
        { id: "parent", title: "Parent", field_ids: ["email", "phone"] },
        { id: "docs", title: "Documents", field_ids: ["immun", "sig"] },
    ],
    fields: [
        f("child_name", { required: true }),
        f("dob", { type: "date", required: true }),
        f("allergies"),
        f("email", { type: "text", required: true }),
        f("phone", { type: "text" }),
        f("immun", { type: "file_ref", required: true }),
        f("sig", { type: "signature", required: true }),
    ],
};

describe("buildGuidedQuestionPlan — minimal phases", () => {
    it("collapses to at most three phases: confirm → provide → uploads", () => {
        const plan = buildGuidedQuestionPlan(schema, { child_name: "Ada", dob: "2018-01-01", email: "a@b.com" });
        expect(plan.steps.map((s) => s.kind)).toEqual(["confirm", "provide", "uploads"]);
    });

    it("confirms ALL known fields across sections in ONE screen", () => {
        const plan = buildGuidedQuestionPlan(schema, { child_name: "Ada", dob: "2018-01-01", email: "a@b.com" });
        const confirm = plan.steps.find((s) => s.kind === "confirm")!;
        expect(confirm.fieldIds).toEqual(["child_name", "dob", "email"]); // across Child + Parent
        // only one confirm step (no per-section split)
        expect(plan.steps.filter((s) => s.kind === "confirm")).toHaveLength(1);
    });

    it("asks only the missing fields, batched into ONE provide screen", () => {
        const plan = buildGuidedQuestionPlan(schema, { child_name: "Ada", dob: "2018-01-01", email: "a@b.com" });
        const provide = plan.steps.find((s) => s.kind === "provide")!;
        expect(provide.fieldIds).toEqual(["allergies", "phone"]); // the only missing scalars
        expect(plan.steps.filter((s) => s.kind === "provide")).toHaveLength(1);
    });

    it("puts uploads + signatures in one final phase (keeps their types)", () => {
        const plan = buildGuidedQuestionPlan(schema, {});
        const uploads = plan.steps.find((s) => s.kind === "uploads")!;
        expect(uploads.fieldIds).toEqual(["immun", "sig"]);
    });

    it("skips empty phases — everything known + no uploads → a single confirm step", () => {
        const noUploads: FormSchemaV1 = { ...schema, sections: schema.sections.slice(0, 2), fields: schema.fields.slice(0, 5) };
        const plan = buildGuidedQuestionPlan(noUploads, { child_name: "A", dob: "x", allergies: "n", email: "e", phone: "p" });
        expect(plan.steps.map((s) => s.kind)).toEqual(["confirm"]);
    });

    it("nothing known → no confirm phase (don't make parents re-confirm blanks)", () => {
        const plan = buildGuidedQuestionPlan(schema, {});
        expect(plan.steps.map((s) => s.kind)).toEqual(["provide", "uploads"]);
    });

    it("collects shared_value_key duplicates once and counts once", () => {
        const dup: FormSchemaV1 = {
            schema_version: 1,
            title: "Two forms",
            sections: [{ id: "s", title: "Contact", field_ids: ["email_a", "email_b"] }],
            fields: [
                f("email_a", { et: "person", fk: "email", svk: "parent_email", required: true }),
                f("email_b", { et: "person", fk: "email", svk: "parent_email", required: true }),
            ],
        };
        const plan = buildGuidedQuestionPlan(dup, {});
        expect(plan.steps.find((s) => s.kind === "provide")!.fieldIds).toEqual(["email_a"]);
        expect(plan.counts.missing).toBe(1);
        expect(plan.canonicalGroups["shared:parent_email"]).toEqual(["email_a", "email_b"]);
    });

    it("counts known/missing/uploads/requiredMissing", () => {
        const plan = buildGuidedQuestionPlan(schema, { child_name: "Ada" });
        expect(plan.counts.known).toBe(1); // child_name
        expect(plan.counts.uploads).toBe(2); // immun + sig
        // missing scalars: dob(req), allergies(opt), email(req), phone(opt) → 2 required
        expect(plan.counts.requiredMissing).toBe(2);
    });
});

describe("mirrorCanonicalValues", () => {
    it("copies the representative value to siblings", () => {
        expect(mirrorCanonicalValues({ a: "v", b: "" }, { g: ["a", "b"] }).b).toBe("v");
    });
    it("returns same object when nothing to mirror", () => {
        const v = { x: "1" };
        expect(mirrorCanonicalValues(v, { "field:x": ["x"] })).toBe(v);
    });
});

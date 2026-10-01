import { describe, expect, it } from "vitest";

import {
    CREATE_FIELD_ENTITIES,
    fieldKeyFromLabel,
    planCreateFieldFromSource,
} from "@/lib/pos/formDraft/createFieldFromSource";

describe("naming a destination after the question on the page", () => {
    it("derives a storage key from the operator's own wording", () => {
        // An apostrophe is dropped rather than turned into a separator, in either typographic form.
        expect(fieldKeyFromLabel("Student’s first day")).toBe("students_first_day");
        expect(fieldKeyFromLabel("Student's first day")).toBe("students_first_day");
        expect(fieldKeyFromLabel("Student Date of Birth")).toBe("student_date_of_birth");
    });

    it("never produces a key the configuration API would reject", () => {
        // Leading/trailing punctuation, double separators and a 64-character ceiling.
        expect(fieldKeyFromLabel("  --Allergies?  ")).toBe("allergies");
        expect(fieldKeyFromLabel("A".repeat(90))!.length).toBe(64);
        expect(fieldKeyFromLabel("???")).toBeNull();
        expect(fieldKeyFromLabel("x")).toBeNull();
    });
});

describe("creating a field from the form", () => {
    it("builds a canonical, org-scoped field definition request", () => {
        const plan = planCreateFieldFromSource({
            label: "Student Age Upon Enrolling",
            entityType: "customer_member",
            fieldType: "number",
        });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.request).toEqual({
            entity_type: "customer_member",
            field_key: "student_age_upon_enrolling",
            field_type: "number",
            label: "Student Age Upon Enrolling",
            section_key: "imported",
        });
    });

    it("returns the mapping choice that points the question at the new field", () => {
        const plan = planCreateFieldFromSource({ label: "Bus route", entityType: "customer", fieldType: "text" });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.choice.destination).toEqual({ entity_type: "customer", field_key: "bus_route" });
        expect(plan.choice.label).toBe("Bus route");
    });

    it("carries the source's own choices onto a choice field", () => {
        const plan = planCreateFieldFromSource({
            label: "T-shirt size",
            entityType: "customer_member",
            fieldType: "select",
            options: ["Small", " Medium ", "", "Large"],
        });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.request.field_type).toBe("select");
        expect(plan.request.config).toEqual({ options: ["Small", "Medium", "Large"] });
    });

    it("stores a choice question with no choices as text rather than an unusable select", () => {
        const plan = planCreateFieldFromSource({ label: "Preference", entityType: "person", fieldType: "select" });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.request.field_type).toBe("text");
        expect(plan.request.config).toBeUndefined();
    });

    it("refuses a name with nothing storable in it, instead of posting an invalid key", () => {
        expect(planCreateFieldFromSource({ label: "***", entityType: "person", fieldType: "text" })).toEqual({
            ok: false,
            reason: "unusable_name",
        });
    });

    it("refuses an entity or a type outside the canonical vocabularies", () => {
        expect(planCreateFieldFromSource({ label: "X ray", entityType: "vendor", fieldType: "text" })).toEqual({
            ok: false,
            reason: "unknown_entity",
        });
        expect(planCreateFieldFromSource({ label: "X ray", entityType: "person", fieldType: "signature" })).toEqual({
            ok: false,
            reason: "unusable_type",
        });
    });

    it("offers only entities the operator can name in business language", () => {
        expect([...CREATE_FIELD_ENTITIES]).toEqual(["customer_member", "person", "customer"]);
    });
});

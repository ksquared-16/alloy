import { describe, it, expect } from "vitest";
import { buildPacketFieldPlan, type PacketSourceForm } from "@/lib/pos/packet/packetFieldPlan";
import type { FormField } from "@/lib/forms/schema";

function field(
    id: string,
    opts: Partial<Pick<FormField, "label" | "required">> & {
        type?: FormField["type"];
        entity_type?: string;
        field_key?: string;
        shared_value_key?: string;
        pdf_slot?: string;
    } = {},
): FormField {
    const { entity_type, field_key, shared_value_key, pdf_slot, type = "text", label = id, required = false } = opts;
    const base = {
        id,
        label,
        required,
        type,
        ...(pdf_slot ? { pdf_slot } : {}),
        ...(entity_type && field_key
            ? { field_source: { entity_type, field_key, ...(shared_value_key ? { shared_value_key } : {}) } }
            : {}),
    };
    return base as FormField;
}

function form(form_id: string, fields: FormField[], form_name?: string): PacketSourceForm {
    return { form_id, form_name, schema: { fields } };
}

describe("buildPacketFieldPlan", () => {
    it("collects a repeated canonical field once across forms", () => {
        const a = form("formA", [field("a_name", { entity_type: "customer_member", field_key: "child_name", required: true })]);
        const b = form("formB", [field("b_name", { entity_type: "customer_member", field_key: "child_name" })]);

        const plan = buildPacketFieldPlan([a, b]);

        expect(plan.distinct_field_count).toBe(1);
        expect(plan.total_consumer_fields).toBe(2);
        expect(plan.collected_once_count).toBe(1);

        const entry = plan.entries[0];
        expect(entry.canonical_key).toBe("customer_member:child_name");
        expect(entry.shared_value_key).toBe("customer_member:child_name");
        expect(entry.basis).toBe("canonical");
        expect(entry.consumers.map((c) => c.form_id)).toEqual(["formA", "formB"]);
    });

    it("marks required if ANY consumer requires the field", () => {
        const a = form("formA", [field("a", { entity_type: "person", field_key: "email", required: false })]);
        const b = form("formB", [field("b", { entity_type: "person", field_key: "email", required: true })]);
        const plan = buildPacketFieldPlan([a, b]);
        expect(plan.entries[0].required).toBe(true);
    });

    it("uses shared_value_key alias as the dedupe identity when present", () => {
        const a = form("formA", [field("a", { entity_type: "person", field_key: "phone", shared_value_key: "parent_phone" })]);
        const b = form("formB", [field("b", { entity_type: "person", field_key: "mobile", shared_value_key: "parent_phone" })]);
        const plan = buildPacketFieldPlan([a, b]);
        expect(plan.distinct_field_count).toBe(1);
        expect(plan.entries[0].basis).toBe("shared_alias");
        expect(plan.entries[0].canonical_key).toBe("parent_phone");
        expect(plan.entries[0].shared_value_key).toBe("parent_phone");
    });

    it("never merges unbound fields and gives them no shared_value_key", () => {
        const a = form("formA", [field("note1", { label: "Notes" })]);
        const b = form("formB", [field("note2", { label: "Notes" })]);
        const plan = buildPacketFieldPlan([a, b]);
        expect(plan.distinct_field_count).toBe(2);
        for (const e of plan.entries) {
            expect(e.basis).toBe("unbound");
            expect(e.shared_value_key).toBeUndefined();
            expect(e.consumers).toHaveLength(1);
        }
    });

    it("preserves PDF output targets separately per consumer", () => {
        const a = form("formA", [field("a", { entity_type: "customer_member", field_key: "child_name", pdf_slot: "MO500.child_name" })]);
        const b = form("formB", [field("b", { entity_type: "customer_member", field_key: "child_name", pdf_slot: "ENROLL.student" })]);
        const plan = buildPacketFieldPlan([a, b]);
        const entry = plan.entries[0];
        expect(entry.output_targets).toEqual([
            { form_id: "formA", pdf_slot: "MO500.child_name" },
            { form_id: "formB", pdf_slot: "ENROLL.student" },
        ]);
        // pdf_slot is carried on each consumer, not used as identity.
        expect(entry.consumers[0].pdf_slot).toBe("MO500.child_name");
        expect(entry.consumers[1].pdf_slot).toBe("ENROLL.student");
    });

    it("records a type conflict warning but keeps the first type", () => {
        const a = form("formA", [field("a", { entity_type: "person", field_key: "dob", type: "date" })]);
        const b = form("formB", [field("b", { entity_type: "person", field_key: "dob", type: "text" })]);
        const plan = buildPacketFieldPlan([a, b]);
        expect(plan.entries[0].type).toBe("date");
        expect(plan.entries[0].warnings.length).toBe(1);
        expect(plan.warnings.length).toBe(1);
    });

    it("skips group (structural) fields", () => {
        const group = { id: "g", label: "G", required: false, type: "group", fields: [field("inner", { entity_type: "person", field_key: "email" })] } as FormField;
        const plan = buildPacketFieldPlan([form("formA", [group, field("real", { entity_type: "person", field_key: "email" })])]);
        expect(plan.total_consumer_fields).toBe(1);
        expect(plan.entries).toHaveLength(1);
        expect(plan.entries[0].field_key).toBe("email");
    });

    it("is deterministic in entry order (first appearance)", () => {
        const a = form("formA", [
            field("x", { entity_type: "person", field_key: "first_name" }),
            field("y", { entity_type: "person", field_key: "last_name" }),
        ]);
        const plan = buildPacketFieldPlan([a]);
        expect(plan.entries.map((e) => e.field_key)).toEqual(["first_name", "last_name"]);
    });
});

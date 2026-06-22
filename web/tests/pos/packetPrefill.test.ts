import { describe, it, expect } from "vitest";
import { buildPacketFieldPlan, type PacketSourceForm } from "@/lib/pos/packet/packetFieldPlan";
import { resolvePacketPrefill, type PacketRecordSnapshot } from "@/lib/pos/packet/packetPrefill";
import type { FormField } from "@/lib/forms/schema";

function field(id: string, entity_type: string, field_key: string, required = false): FormField {
    return { id, label: id, required, type: "text", field_source: { entity_type, field_key } } as FormField;
}
function unbound(id: string): FormField {
    return { id, label: id, required: true, type: "text" } as FormField;
}
function form(form_id: string, fields: FormField[]): PacketSourceForm {
    return { form_id, schema: { fields } };
}

describe("resolvePacketPrefill", () => {
    const plan = buildPacketFieldPlan([
        form("f", [
            field("name", "customer_member", "child_name", true),
            field("email", "person", "email", true),
            field("allergies", "customer_member", "allergies", false),
        ]),
    ]);

    it("classifies present values as known/confirmable and absent as missing", () => {
        const snapshot: PacketRecordSnapshot = {
            values: { "customer_member:child_name": "Ada", "person:email": "a@b.com" },
            sources: { "customer_member:child_name": "child", "person:email": "parent" },
        };
        const result = resolvePacketPrefill(plan, snapshot);

        expect(result.known_count).toBe(2);
        expect(result.missing_count).toBe(1);

        const byKey = Object.fromEntries(result.entries.map((e) => [e.entry.canonical_key, e]));
        expect(byKey["customer_member:child_name"].status).toBe("known");
        expect(byKey["customer_member:child_name"].prefilled_value).toBe("Ada");
        expect(byKey["customer_member:child_name"].source).toBe("child");
        expect(byKey["customer_member:allergies"].status).toBe("missing");
    });

    it("counts required-missing as the parent's minimum work", () => {
        const result = resolvePacketPrefill(plan, { values: {} });
        // name + email required and missing; allergies missing but optional.
        expect(result.missing_count).toBe(3);
        expect(result.required_missing_count).toBe(2);
    });

    it("treats empty string / whitespace / empty array as not present", () => {
        const result = resolvePacketPrefill(plan, {
            values: { "customer_member:child_name": "   ", "person:email": "", "customer_member:allergies": [] },
        });
        expect(result.known_count).toBe(0);
        expect(result.missing_count).toBe(3);
    });

    it("resolves via shared_value_key alias when the snapshot is keyed that way", () => {
        const aliasPlan = buildPacketFieldPlan([
            form("f", [{ id: "ph", label: "Phone", required: true, type: "text", field_source: { entity_type: "person", field_key: "phone", shared_value_key: "parent_phone" } } as FormField]),
        ]);
        const result = resolvePacketPrefill(aliasPlan, { values: { parent_phone: "555-1234" } });
        expect(result.known_count).toBe(1);
        expect(result.entries[0].prefilled_value).toBe("555-1234");
    });

    it("always treats unbound fields as missing (Alloy could not have stored them)", () => {
        const p = buildPacketFieldPlan([form("f", [unbound("scratch")])]);
        const result = resolvePacketPrefill(p, { values: { scratch: "ignored-because-unbound" } });
        expect(result.entries[0].status).toBe("missing");
        expect(result.required_missing_count).toBe(1);
    });
});

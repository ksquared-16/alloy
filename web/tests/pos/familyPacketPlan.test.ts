import { describe, it, expect } from "vitest";
import { classifyFieldScope, partitionFieldsByScope } from "@/lib/forms/fieldScope";
import { buildFamilyPacketInstancePlan, buildFamilyFieldScopePlan, type FamilyPacketForm } from "@/lib/pos/packet/familyPacketPlan";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

function f(id: string, type: FormField["type"], src?: { entity_type: string; field_key: string; shared_value_key?: string }): FormField {
    return { id, label: id, required: false, type, ...(src ? { field_source: src } : {}) } as FormField;
}
function schemaOf(fields: FormField[]): FormSchemaV1 {
    return { schema_version: 1, title: "T", sections: [{ id: "s", field_ids: fields.map((x) => x.id) }], fields };
}

describe("classifyFieldScope", () => {
    it("signatures are recipient-scoped", () => {
        expect(classifyFieldScope(f("sig", "signature"))).toBe("recipient");
    });
    it("child entities → child scope", () => {
        expect(classifyFieldScope(f("c", "text", { entity_type: "customer_member", field_key: "child_name" }))).toBe("child");
        expect(classifyFieldScope(f("c", "date", { entity_type: "inquiry_child", field_key: "dob" }))).toBe("child");
    });
    it("household entities → household scope", () => {
        expect(classifyFieldScope(f("p", "text", { entity_type: "person", field_key: "email" }))).toBe("household");
        expect(classifyFieldScope(f("a", "text", { entity_type: "customer", field_key: "address" }))).toBe("household");
    });
    it("unbound defaults to household (configurable)", () => {
        expect(classifyFieldScope(f("x", "text"))).toBe("household");
        expect(classifyFieldScope(f("x", "text"), { defaultScope: "child" })).toBe("child");
    });
    it("partitions a schema by scope", () => {
        const s = schemaOf([
            f("email", "text", { entity_type: "person", field_key: "email" }),
            f("child_name", "text", { entity_type: "customer_member", field_key: "child_name" }),
            f("dob", "date", { entity_type: "customer_member", field_key: "dob" }),
            f("sig", "signature"),
        ]);
        expect(partitionFieldsByScope(s)).toEqual({ household: ["email"], child: ["child_name", "dob"], recipient: ["sig"] });
    });
});

describe("buildFamilyPacketInstancePlan", () => {
    const anchor = { entity_type: "opportunity" as const, entity_id: "opp1", opportunity_id: "opp1", customer_id: "cust1" };

    it("creates ONE instance with one access record per recipient (not per pair)", () => {
        const plan = buildFamilyPacketInstancePlan({
            anchor,
            children: [{ customer_member_id: "mck", label: "McKenzie" }, { customer_member_id: "emy", label: "Emyrson" }],
            recipients: [{ person_id: "justin", label: "Justin" }, { person_id: "molly", label: "Molly" }],
            form_ids: ["health", "enroll", "emergency"],
            instance_key: "inst_fixed",
        });
        // 2 children + 2 recipients → ONE instance, TWO recipient access records (not 4 packets)
        expect(plan.instance_key).toBe("inst_fixed");
        expect(plan.children).toHaveLength(2);
        expect(plan.recipient_access).toHaveLength(2);
        expect(plan.recipient_access.map((r) => r.recipient_person_id)).toEqual(["justin", "molly"]);
        // both access records point at the same instance
        expect(plan.recipient_access.every((r) => r.access_key.startsWith("inst_fixed__"))).toBe(true);
    });

    it("dedupes children + recipients and warns on empties", () => {
        const plan = buildFamilyPacketInstancePlan({ anchor, children: [{ customer_member_id: "a" }, { customer_member_id: "a" }], recipients: [], form_ids: [], instance_key: "k" });
        expect(plan.children).toHaveLength(1);
        expect(plan.warnings.some((w) => /recipient/i.test(w))).toBe(true);
        expect(plan.warnings.some((w) => /forms/i.test(w))).toBe(true);
    });
});

describe("buildFamilyFieldScopePlan — sibling handling", () => {
    const health: FamilyPacketForm = {
        form_id: "health",
        schema: schemaOf([
            f("parent_email", "text", { entity_type: "person", field_key: "email" }),
            f("child_name", "text", { entity_type: "customer_member", field_key: "child_name" }),
            f("allergies", "text", { entity_type: "customer_member", field_key: "allergies" }),
            f("sig", "signature"),
        ]),
    };
    const enroll: FamilyPacketForm = {
        form_id: "enroll",
        schema: schemaOf([
            // duplicate parent email across forms → deduped (collect once)
            f("email2", "text", { entity_type: "person", field_key: "email" }),
            f("program", "text", { entity_type: "customer_member", field_key: "program" }),
            f("consent", "signature"),
        ]),
    };

    it("asks household once, child per child, signatures per recipient", () => {
        const plan = buildFamilyFieldScopePlan([health, enroll], 2 /* children */, 2 /* recipients */);
        // household: parent email deduped across the two forms → 1
        expect(plan.counts.householdOnce).toBe(1);
        expect(plan.household.map((q) => q.field_id)).toEqual(["parent_email"]);
        // child: child_name, allergies, program → 3 distinct, asked per child
        expect(plan.counts.childPerChild).toBe(3);
        // recipient: 2 signatures, asked per recipient
        expect(plan.counts.recipientPerRecipient).toBe(2);
        // total for 2 children + 2 recipients: 1 + 3*2 + 2*2 = 11
        expect(plan.counts.totalQuestions).toBe(11);
    });

    it("is far less repetitive than completing each form per child", () => {
        const plan = buildFamilyFieldScopePlan([health, enroll], 2, 2);
        expect(plan.counts.totalQuestions).toBeLessThan(plan.counts.naiveRepeatedTotal);
    });

    it("single child + single recipient still works", () => {
        const plan = buildFamilyFieldScopePlan([health], 1, 1);
        // 1 household + 2 child + 1 recipient = 4
        expect(plan.counts.totalQuestions).toBe(4);
    });
});

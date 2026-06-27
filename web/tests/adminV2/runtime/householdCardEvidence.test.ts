import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

/** Minimal Operational Context wrapper for the pure evidence assembly. */
function ctx(truth: Record<string, unknown>, label = "Household"): OperationalContext {
    return {
        subject: { type: "opportunity", id: String(truth.id ?? "opp"), label },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    };
}

function baseRecord(): Record<string, unknown> {
    return {
        id: "opp-1",
        customer_id: "cust-1",
        updated_at: "2026-06-20T10:00:00Z",
        _customer_name: "Johnson Household",
        "person.primary_contact_name": "Sarah Johnson",
        "person.primary_phone": "555-123-4567",
        "person.primary_email": "sarah@example.com",
        "opportunity.primary_person_id": "p-sarah",
        _opportunity_persons: [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson", phone: "555-123-4567", email: "sarah@example.com" },
            { person_id: "p-mike", role_type: "parent", name: "Michael Johnson", phone: "555-111-2222" },
            { person_id: "p-gran", role_type: "emergency_contact", name: "Grandma Mary", phone: "555-333-4444" },
            { person_id: "p-tom", role_type: "authorized_pickup", name: "Uncle Tom" },
            { person_id: "p-pay", role_type: "billing_contact", name: "Sarah Johnson" },
        ],
        _inquiry_children: [
            { id: "c1", display_name: "Emma Johnson", age: "6", outcome_status_label: "Enrolled" },
            { id: "c2", display_name: "Liam Johnson", age: "4" },
        ],
    };
}

describe("buildHouseholdCardEvidence", () => {
    it("assembles the operational answer from loaded record fields (no fetch)", () => {
        const ev = buildHouseholdCardEvidence(ctx(baseRecord(), "Johnson Household"));

        expect(ev.householdLabel).toBe("Johnson Household");
        expect(ev.primaryContact?.name).toBe("Sarah Johnson");
        expect(ev.primaryPhone).toBe("555-123-4567");
        expect(ev.primaryEmail).toBe("sarah@example.com");
        expect(ev.childCount).toBe(2);
        expect(ev.answerLine).toContain("Sarah Johnson");
        expect(ev.answerLine).toContain("2 children");
        expect(ev.missingCriticalWarning).toBeNull();
    });

    it("classifies evidence groups by relationship role", () => {
        const ev = buildHouseholdCardEvidence(ctx(baseRecord()));
        const keys = ev.groups.map((g) => g.key);

        expect(keys).toContain("primary_contact");
        expect(keys).toContain("other_parent_guardian");
        expect(keys).toContain("children");
        expect(keys).toContain("emergency_contacts");
        expect(keys).toContain("authorized_pickups");
        expect(keys).toContain("billing_contact");

        expect(ev.emergencyContactCount).toBe(1);
        expect(ev.authorizedPickupCount).toBe(1);
        expect(ev.otherParentGuardianCount).toBe(1);

        const otherParent = ev.groups.find((g) => g.key === "other_parent_guardian");
        expect(otherParent?.contacts.map((c) => c.name)).toEqual(["Michael Johnson"]);

        const children = ev.groups.find((g) => g.key === "children");
        expect(children?.children.map((c) => c.name)).toEqual(["Emma Johnson", "Liam Johnson"]);
    });

    it("surfaces a second parent with role=parent even when a primary contact is resolved", () => {
        // The drawer projection filter excludes role=parent when primary exists;
        // Household must read raw family rows so Michael is never hidden.
        const ev = buildHouseholdCardEvidence(ctx(baseRecord()));
        const otherParent = ev.groups.find((g) => g.key === "other_parent_guardian");
        expect(otherParent?.contacts.some((c) => c.name === "Michael Johnson")).toBe(true);
        // Primary must not appear in other parent group.
        expect(otherParent?.contacts.some((c) => c.name === "Sarah Johnson")).toBe(false);
    });

    it("does not duplicate the primary person in Other Parent / Guardian", () => {
        const record = baseRecord();
        record._opportunity_persons = [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson" },
            { person_id: "p-sarah", role_type: "parent", name: "Sarah Johnson" },
            { person_id: "p-mike", role_type: "parent", name: "Michael Johnson" },
        ];
        const ev = buildHouseholdCardEvidence(ctx(record));
        const otherParent = ev.groups.find((g) => g.key === "other_parent_guardian");
        expect(otherParent?.contacts.map((c) => c.name)).toEqual(["Michael Johnson"]);
        expect(ev.primaryContact?.name).toBe("Sarah Johnson");
    });

    it("treats children as belonging-only — names/count, no child operational fields", () => {
        const record = baseRecord();
        record._inquiry_children = [
            {
                id: "c1",
                display_name: "Emma Johnson",
                age: "6",
                desired_program_label: "Preschool",
                outcome_status_label: "Enrolled",
            },
        ];
        const ev = buildHouseholdCardEvidence(ctx(record));
        const children = ev.groups.find((g) => g.key === "children");

        expect(children?.count).toBe(1);
        const child = children?.children[0];
        expect(child?.name).toBe("Emma Johnson");
        expect(Object.keys(child ?? {}).sort()).toEqual(["id", "name"]);
        const serialized = JSON.stringify(ev.groups);
        expect(serialized).not.toContain("Age 6");
        expect(serialized).not.toContain("Preschool");
        expect(serialized).not.toContain("Enrolled");
    });

    it("includes address as a distinct evidence group when real address fields are present", () => {
        expect(buildHouseholdCardEvidence(ctx(baseRecord())).address).toBeNull();
        const keysWithout = buildHouseholdCardEvidence(ctx(baseRecord())).groups.map((g) => g.key);
        expect(keysWithout).not.toContain("address");

        const withAddress = baseRecord();
        withAddress["person.primary_address_line1"] = "742 Evergreen Terrace";
        withAddress["person.primary_address_city"] = "Springfield";
        withAddress["person.primary_address_state"] = "OR";
        withAddress["person.primary_address_postal_code"] = "97403";
        const ev = buildHouseholdCardEvidence(ctx(withAddress));
        expect(ev.address).toContain("742 Evergreen Terrace");
        expect(ev.address).toContain("Springfield");

        const addressGroup = ev.groups.find((g) => g.key === "address");
        expect(addressGroup?.title).toBe("Address");
        expect(addressGroup?.addressLine).toContain("742 Evergreen Terrace");
    });

    it("warns when no primary contact is on file", () => {
        const ev = buildHouseholdCardEvidence(ctx({ id: "opp-2", _inquiry_children: [] }));
        expect(ev.primaryContact).toBeNull();
        expect(ev.missingCriticalWarning).toBe("No primary contact on file");
    });

    it("warns when a primary exists but no emergency contact is present", () => {
        const record = baseRecord();
        record._opportunity_persons = [
            { person_id: "p-sarah", role_type: "primary_contact", name: "Sarah Johnson" },
        ];
        const ev = buildHouseholdCardEvidence(ctx(record));
        expect(ev.primaryContact?.name).toBe("Sarah Johnson");
        expect(ev.emergencyContactCount).toBe(0);
        expect(ev.missingCriticalWarning).toBe("No emergency contact on file");
    });

    it("reports preferred contact method only when present (documented gap otherwise)", () => {
        const withPref = baseRecord();
        withPref["person.preferred_contact_method"] = "Text";
        expect(buildHouseholdCardEvidence(ctx(withPref)).preferredContactMethod).toBe("Text");
        expect(buildHouseholdCardEvidence(ctx(baseRecord())).preferredContactMethod).toBeNull();
    });
});

describe("HouseholdCard component — Operational Context boundary purity", () => {
    const source = readFileSync(
        path.resolve(__dirname, "../../../components/admin/focusPanel/cards/HouseholdCard.tsx"),
        "utf8",
    );

    it("consumes only the Operational Context boundary — no drawer/record/LayoutDoc concepts", () => {
        expect(source).toContain("OperationalContext");
        const forbidden = [
            "displayVm",
            "OpportunityDrawerViewModel",
            "OperationalSubjectViewModel",
            "drawerId",
            "DrawerTabKey",
            "LayoutDoc",
            "vmDrawer",
            "FocusPanelCardCompat",
        ];
        for (const token of forbidden) {
            expect(source, `HouseholdCard must not reference "${token}"`).not.toContain(token);
        }
        expect(source).not.toMatch(/record\s*:/);
    });
});

/**
 * NEGATIVE CONTROLS for the binding boundary.
 *
 * A false canonical binding is higher severity than a missing one. A missing binding costs an
 * operator one decision; a false one writes a stranger's phone number onto a family's record and
 * looks correct while doing it. Every test here asserts a REFUSAL.
 */

import { describe, expect, it } from "vitest";
import { checkBindingParty, partyOfFieldSource } from "@/lib/pos/discovery/bindingSafety";
import { matchConcept } from "@/lib/pos/discovery/configurationMatching";
import { DISCOVERY_CONTRACT_VERSION, type BusinessConceptCandidate, type ConceptSubject } from "@/lib/pos/discovery/contracts";

const PERSON_PHONE = { entity_type: "person", field_key: "phone" };
const PERSON_EMAIL = { entity_type: "person", field_key: "email" };
const GUARDIAN_NAME = { entity_type: "guardian", field_key: "guardian_first_name" };
const HOUSEHOLD_ADDRESS = { entity_type: "customer", field_key: "address" };

const concept = (over: Partial<BusinessConceptCandidate> & { label: string }): BusinessConceptCandidate => ({
    contract_version: DISCOVERY_CONTRACT_VERSION,
    id: "1:section:field_x",
    kind: "scalar_field",
    concept_key: over.concept_key ?? "unknown.x",
    subject: (over.subject ?? "child") as ConceptSubject,
    cardinality: "single",
    suggested_data_type: over.suggested_data_type ?? "text",
    source: { page: 1, section_title: "Section", section_key: "section", labels: [over.label] },
    confidence: { band: "review", percent: 65, signals: [] },
    explanation: "",
    ...over,
});

describe("a physician's phone must not become a family member's phone", () => {
    it("refuses the binding", () => {
        const v = checkBindingParty("physician", "phone", PERSON_PHONE, "Primary Physician Phone Number:");
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toContain("no canonical field for a physician");
    });

    it("binds it to the physician relationship end to end, never to a person field", () => {
        // Slice 4 gave the physician a canonical owner — a relationship definition row — so the
        // fact is no longer merely refused, it lands somewhere correct. The property that must hold
        // either way is that it never reaches the household's person record.
        const p = matchConcept(concept({ label: "Primary Physician Phone Number:", party: "physician", attribute: "phone", concept_key: "physician.phone" }));
        expect(p.disposition).toBe("relationship_binding");
        expect(p.target_relationship_role).toBe("physician");
        expect(p.target_field_source).toBeUndefined();
    });

    it("still refuses the person binding for a party with no owner at all", () => {
        // The boundary itself is unchanged: a party with no canonical home and no relationship
        // definition is refused rather than approximated.
        const v = checkBindingParty("sibling", "phone", PERSON_PHONE, "Sibling phone");
        expect(v.ok).toBe(false);
    });

    it("a dentist is not a physician and not a person record either", () => {
        expect(checkBindingParty("dentist", "phone", PERSON_PHONE, "Dentist Phone Number").ok).toBe(false);
    });
});

describe("the child's name and the guardian's name are different facts", () => {
    it("binds the child's name to the child's own field", () => {
        const v = checkBindingParty("child", "name", GUARDIAN_NAME, "Student Name:");
        expect(v.ok).toBe(true);
        if (v.ok) {
            expect(v.field_source.entity_type).toBe("child");
            expect(v.redirected, "a guardian field offered for a child fact must be redirected").toBe(true);
        }
    });

    it("binds the guardian's name to the guardian's own field", () => {
        const v = checkBindingParty("guardian", "name", { entity_type: "child", field_key: "child_first_name" }, "Parent/Guardian #1 Name:");
        expect(v.ok).toBe(true);
        if (v.ok) expect(v.field_source.field_key).toBe("guardian_first_name");
    });

    it("never lets one party's name land on the other's field", () => {
        const child = checkBindingParty("child", "name", GUARDIAN_NAME, "Student Name:");
        const guardian = checkBindingParty("guardian", "name", { entity_type: "child", field_key: "child_first_name" }, "Parent Name:");
        expect(child.ok && guardian.ok).toBe(true);
        if (child.ok && guardian.ok) expect(child.field_source.field_key).not.toBe(guardian.field_source.field_key);
    });
});

describe("the guardian's contact details go to the guardian, not to a bare person record", () => {
    it("redirects phone and email to the guardian's registered fields", () => {
        const phone = checkBindingParty("guardian", "phone", PERSON_PHONE, "Parent/Guardian #1 Phone Number:");
        const email = checkBindingParty("guardian", "email", PERSON_EMAIL, "Parent/Guardian #1 Email Address:");
        expect(phone.ok && email.ok).toBe(true);
        if (phone.ok) expect(phone.field_source.field_key).toBe("guardian_phone");
        if (email.ok) expect(email.field_source.field_key).toBe("guardian_email");
    });
});

describe("the household's address is not any address that mentions a city", () => {
    it("refuses a bare address component", () => {
        for (const label of ["City:", "State:", "Zip Code", "Postal code"]) {
            const v = checkBindingParty("unknown", "address", HOUSEHOLD_ADDRESS, label);
            expect(v.ok, `${label} must not bind to the household address`).toBe(false);
        }
    });

    it("accepts a label that actually names an address", () => {
        expect(checkBindingParty("unknown", "address", HOUSEHOLD_ADDRESS, "Physical Address, City, State and Zip Code:").ok).toBe(true);
    });

    it("refuses a guardian's own address on the household address field", () => {
        // A secondary parent's mailing address is not where the household lives.
        const v = checkBindingParty("guardian", "address", HOUSEHOLD_ADDRESS, "Mailing Address or Secondary Parent Address (if applicable):");
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.reason).toContain("belongs to the household");
    });
});

describe("an emergency contact is a person reached through a relationship", () => {
    it("refuses to write their details onto the household's person record", () => {
        for (const attr of ["name", "phone", "address"]) {
            const v = checkBindingParty("emergency_contact", attr, attr === "name" ? GUARDIAN_NAME : PERSON_PHONE, `Emergency Contact #1 ${attr}`);
            expect(v.ok, `emergency contact ${attr} must not bind`).toBe(false);
            if (!v.ok) expect(v.reason).toContain("relationship model");
        }
    });

    it("refuses the account holder for the same reason", () => {
        expect(checkBindingParty("account_holder", "name", GUARDIAN_NAME, "Account Holder Full Name:").ok).toBe(false);
    });
});

describe("the boundary is honest about what it does not know", () => {
    it("keeps the matcher's answer when the label names no party", () => {
        const v = checkBindingParty("unknown", "phone", PERSON_PHONE, "Phone number");
        expect(v.ok).toBe(true);
        if (v.ok) expect(v.reason).toContain("no party derived");
    });

    it("derives a field's party from the field itself, not from a table", () => {
        expect(partyOfFieldSource({ entity_type: "child", field_key: "child_first_name" })).toBe("child");
        expect(partyOfFieldSource({ entity_type: "guardian", field_key: "guardian_phone" })).toBe("guardian");
        expect(partyOfFieldSource({ entity_type: "customer", field_key: "address" })).toBe("household");
        expect(partyOfFieldSource({ entity_type: "person", field_key: "phone" })).toBe("unknown");
    });
});

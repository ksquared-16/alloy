/**
 * Finding the party slots on a REAL imported artifact.
 *
 * R1 proved the projection and hand-authored its slots. This finds them, which is what closes the
 * broadcast defect: seven destinations belonging to six different parties all carry
 * `entity_type: person, field_key: phone`, so the ask-once layer collapsed them into ONE need and
 * one answer would print into all seven boxes — including the dentist's.
 */

import { describe, expect, it } from "vitest";

import {
    artifactPartySlots,
    broadcastingPartyFieldIds,
    matchCanonicalRole,
    partySlotFieldIds,
} from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/** Alloy's own seeded vocabulary — `customer_person_role_types`. */
const ROLES = ["authorized_pickup", "child", "emergency_contact", "guardian", "parent", "payer", "primary_contact"];

/** The Admissions packet's real party region, labels verbatim. */
const REAL = {
    fields: [
        { id: "field_7", type: "text", label: "Parent/Guardian #1 Name" },
        { id: "field_8", type: "text", label: "Parent/Guardian #1 Phone Number" },
        { id: "field_9", type: "text", label: "Parent/Guardian #1 Email Address" },
        { id: "field_10", type: "text", label: "Parent/Guardian #2 Name" },
        { id: "field_11", type: "text", label: "Parent/Guardian #2 Phone Number" },
        { id: "field_14", type: "text", label: "Mailing Address or Secondary Parent Address (if applicable):" },
        { id: "field_15", type: "text", label: "Parent/Guardian #1 Employer" },
        { id: "field_16", type: "text", label: "Parent/Guardian #1 Employer Address" },
        { id: "field_19", type: "text", label: "LOCAL Emergency Contact #1 Authorized adult allowed to pick my student up in case of emergency or planned pick up" },
        { id: "field_20", type: "text", label: "Emergency Contact #1 Relationship to Student" },
        { id: "field_21", type: "text", label: "Emergency Contact #1 Phone Number" },
        { id: "field_29", type: "text", label: "Emergency Contact #3 Phone Number" },
        { id: "field_31", type: "text", label: "Comments regarding authorized adults and emergency contacts" },
        { id: "field_36", type: "text", label: "Primary Physician Name" },
        { id: "field_37", type: "text", label: "Primary Physician Phone Number" },
        { id: "field_38", type: "text", label: "Dentist Name, if applicable" },
        { id: "field_39", type: "text", label: "Dentist Phone Number, if applicable" },
        { id: "field_2", type: "text", label: "Student Date of Birth" },
    ],
} as unknown as FormSchemaV1;

const slotFor = (id: string) => artifactPartySlots(REAL, ROLES).find((s) => s.field_id === id);

describe("reading the real packet's party slots", () => {
    it("resolves Parent/Guardian #N to the canonical guardian role", () => {
        const one = slotFor("field_8")!;
        expect(one.role).toBe("guardian");
        expect(one.canonical_role).toBe(true);
        expect(one.ordinal).toBe(1);
        expect(one.attribute).toBe("phone");
        expect(slotFor("field_11")!.ordinal).toBe(2);
    });

    it("resolves the numbered emergency contacts, including the authorization line", () => {
        expect(slotFor("field_21")).toMatchObject({ role: "emergency_contact", ordinal: 1, attribute: "phone" });
        expect(slotFor("field_29")).toMatchObject({ role: "emergency_contact", ordinal: 3, attribute: "phone" });
        // The name is written on the authorization line; the packet prints no separate name box.
        expect(slotFor("field_19")).toMatchObject({ role: "emergency_contact", ordinal: 1, attribute: "authorization" });
        expect(slotFor("field_20")).toMatchObject({ role: "emergency_contact", attribute: "relationship" });
    });

    it("keeps the employer's address apart from the household's", () => {
        // Both bind `customer:address`. One belongs to a guardian slot; the other is the family's.
        expect(slotFor("field_16")).toMatchObject({ role: "guardian", ordinal: 1, attribute: "employer_address" });
        expect(slotFor("field_14"), "the household's own address is not a party slot").toBeUndefined();
    });

    it("recognises the physician and the dentist as CANONICAL roles", () => {
        /*
         * They were canonical all along. `relationshipDefinitions.ts` carries `child_physicians`
         * and `child_dentists` as full definitions; they were invisible here only because this
         * module read `customer_person_role_types` — the CUSTOMER-scoped vocabulary, which does not
         * carry child-scoped provider roles.
         */
        expect(slotFor("field_37")).toMatchObject({ role: "physician", ordinal: 1, attribute: "phone" });
        expect(slotFor("field_39")).toMatchObject({ role: "dentist", ordinal: 1, attribute: "phone" });
        expect(slotFor("field_37")!.canonical_role, "a canonical relationship can be written").toBe(true);
        expect(slotFor("field_39")!.canonical_role).toBe(true);
    });

    it("leaves ordinary questions alone", () => {
        expect(slotFor("field_31"), "a comments box asks for no attribute of a person").toBeUndefined();
        expect(slotFor("field_2")).toBeUndefined();
    });

    it("suppresses every party destination from shared-value dedupe", () => {
        /*
         * THE BROADCAST DEFECT, CLOSED AT THE ROOT.
         *
         * All five of these carry `person:phone`, and they belong to five different parties. Once
         * they are recognised as party destinations they are filled by projection and never join a
         * canonical need, so one answer can no longer reach them all.
         */
        const suppressed = partySlotFieldIds(REAL, ROLES);
        for (const id of ["field_8", "field_11", "field_21", "field_29", "field_37", "field_39"]) {
            expect(suppressed.has(id), id).toBe(true);
        }
        expect(suppressed.has("field_14"), "the household address stays a question").toBe(false);
        expect(suppressed.has("field_31")).toBe(false);
    });
});

describe("the role vocabulary decides, not this file", () => {
    it("prefers the most specific canonical role, deterministically", () => {
        // The canonical detector owns this, priority-ordered, so "Emergency Contact" can never be
        // claimed by the parent/guardian definition.
        expect(matchCanonicalRole("Parent/Guardian ")).toBe("guardian");
        expect(matchCanonicalRole("LOCAL Emergency Contact ")).toBe("emergency_contact");
        expect(matchCanonicalRole("Primary Physician ")).toBe("physician");
        expect(matchCanonicalRole("Dentist ")).toBe("dentist");
        expect(matchCanonicalRole("Mailing ")).toBeNull();
    });

    it("works for a tenant whose roles this program has never seen", () => {
        const kennel = { fields: [
            { id: "k1", type: "text", label: "Owner #1 Name" },
            { id: "k2", type: "text", label: "Owner #1 Mobile" },
            { id: "k3", type: "text", label: "Authorised Collector #2 Name" },
        ] } as unknown as FormSchemaV1;
        const slots = artifactPartySlots(kennel, ["owner", "authorised_collector"]);
        expect(slots.map((s) => `${s.role}#${s.ordinal}:${s.attribute}`)).toEqual([
            "owner#1:name",
            "owner#1:phone",
            "authorised_collector#2:name",
        ]);
    });
});

describe("only what actually broadcasts is suppressed", () => {
    it("suppresses a binding claimed by several parties, and keeps one claimed by a single party", () => {
        /*
         * The measured defect: `person:phone` reached seven boxes belonging to six parties, and
         * `customer:address` reached the household, both employers and three emergency contacts.
         * `guardian_phone` is claimed by ONE party and must survive — suppressing it would delete
         * the primary guardian's phone from the conversation with nothing else collecting it.
         */
        const schema = { fields: [
            { id: "g_phone", type: "text", label: "Parent/Guardian #1 Phone Number", field_source: { entity_type: "guardian", field_key: "guardian_phone", shared_value_key: "guardian_phone" } },
            { id: "g2_phone", type: "text", label: "Parent/Guardian #2 Phone Number", field_source: { entity_type: "person", field_key: "phone" } },
            { id: "e1_phone", type: "text", label: "Emergency Contact #1 Phone Number", field_source: { entity_type: "person", field_key: "phone" } },
            { id: "doc_name", type: "text", label: "Primary Physician Name" },
            { id: "doc_phone", type: "text", label: "Primary Physician Phone Number", field_source: { entity_type: "person", field_key: "phone" } },
            { id: "house", type: "text", label: "Physical Address, City, State and Zip Code", field_source: { entity_type: "customer", field_key: "address" } },
        ] } as unknown as FormSchemaV1;

        const suppressed = broadcastingPartyFieldIds(schema, ROLES);
        expect([...suppressed].sort()).toEqual(["doc_phone", "e1_phone", "g2_phone"]);
        expect(suppressed.has("g_phone"), "one party's own binding survives").toBe(false);
        expect(suppressed.has("house"), "the household's own address is not a party slot").toBe(false);
    });

    it("suppresses nothing when no binding is shared", () => {
        const schema = { fields: [
            { id: "a", type: "text", label: "Owner #1 Name" },
            { id: "b", type: "text", label: "Owner #1 Mobile", field_source: { entity_type: "person", field_key: "owner_phone" } },
        ] } as unknown as FormSchemaV1;
        expect([...broadcastingPartyFieldIds(schema, ["owner"])]).toEqual([]);
    });
});

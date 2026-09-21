import { describe, expect, it } from "vitest";

import {
    participantPersonLabels,
    personSlotKey,
} from "@/lib/enrollment/participantRuntime/participantPersonLabel";
import { artifactPartySlots } from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import { validateFormSchema } from "@/lib/forms/schema";
import type { ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";
import type { EnrollmentInformationNeed } from "@/lib/enrollment/informationNeeds/enrollmentInformationNeedsTypes";

/**
 * "GUARDIAN #1" IS A BOX ON A PAGE, NOT A PERSON.
 *
 * The conversation grouped correctly and then named each group after the packet's numbering, so a
 * family who had just given us someone's name read "Guardian #2 · 5 answers" back. Worse, the
 * platform knew canonically that the first guardian slot holds the household's PRIMARY CONTACT and
 * said "Guardian #1" anyway.
 *
 * The order the name may be taken from is the whole rule, so each step is asserted on its own.
 */

const schema = validateFormSchema({
    schema_version: 1,
    title: "Admissions Information",
    sections: [
        {
            id: "s1",
            title: "Contact Information",
            field_ids: ["g1_name", "g1_phone", "g2_name", "ec1_name", "ec1_phone", "ec2_name"],
        },
    ],
    fields: [
        { id: "g1_name", type: "text", label: "Parent/Guardian #1 Name:", required: true },
        { id: "g1_phone", type: "text", label: "Parent/Guardian #1 Phone Number:", required: true },
        { id: "g2_name", type: "text", label: "Parent/Guardian #2 Name:", required: false },
        { id: "ec1_name", type: "text", label: "Emergency Contact #1 Name:", required: true },
        { id: "ec1_phone", type: "text", label: "Emergency Contact #1 Phone Number:", required: true },
        { id: "ec2_name", type: "text", label: "Emergency Contact #2 Name:", required: false },
    ],
});

const slots = artifactPartySlots(schema, []);

const party = (over: Partial<ChildParty> & { party_id: string; full_name: string; roles: string[] }): ChildParty =>
    ({ priority: 1, person_id: over.party_id, phone: null, email: null, ...over }) as ChildParty;

/** A settled answer against one Form destination, at the grain the projection produces. */
const answered = (fieldId: string, value: string): EnrollmentInformationNeed =>
    ({
        identity: { key: `k_${fieldId}` },
        has_value: true,
        current_value: value,
        occurrences: [{ form_field_id: fieldId }],
    }) as unknown as EnrollmentInformationNeed;

const roleOf = (slotsFound: typeof slots, fieldId: string) =>
    slotsFound.find((s) => s.field_id === fieldId)!;

describe("a numbered slot is named after the person in it", () => {
    it("recognised the packet's own person destinations", () => {
        expect(slots.length).toBeGreaterThan(0);
        expect(roleOf(slots, "g1_name").attribute).toBe("name");
        expect(roleOf(slots, "ec1_phone").attribute).toBe("phone");
    });

    it("speaks the canonical party's own relationship, not the slot's", () => {
        const g1 = roleOf(slots, "g1_name");
        const labels = participantPersonLabels({
            parties: [party({ party_id: "p1", full_name: "Kelly Kurzman", roles: ["guardian", "primary_contact"], priority: 1 })],
            slots,
            needs: [],
        });
        const label = labels.get(personSlotKey(g1.role, g1.ordinal));
        expect(label?.name).toBe("Kelly Kurzman");
        expect(label?.role_label).toBe("Primary contact");
        expect(label?.source).toBe("canonical_party");
    });

    it("calls an ordinary guardian a guardian", () => {
        const g1 = roleOf(slots, "g1_name");
        const labels = participantPersonLabels({
            parties: [party({ party_id: "p2", full_name: "Jordan Kurzman", roles: ["guardian"], priority: 1 })],
            slots,
            needs: [],
        });
        expect(labels.get(personSlotKey(g1.role, g1.ordinal))?.role_label).toBe("Guardian");
    });

    it("priority decides who is #1, never the order the answers arrived", () => {
        const g1 = roleOf(slots, "g1_name");
        const g2 = roleOf(slots, "g2_name");
        const labels = participantPersonLabels({
            parties: [
                party({ party_id: "b", full_name: "Second Adult", roles: ["guardian"], priority: 2 }),
                party({ party_id: "a", full_name: "First Adult", roles: ["guardian"], priority: 1 }),
            ],
            slots,
            needs: [],
        });
        expect(labels.get(personSlotKey(g1.role, g1.ordinal))?.name).toBe("First Adult");
        expect(labels.get(personSlotKey(g2.role, g2.ordinal))?.name).toBe("Second Adult");
    });

    it("falls back to this slot's own name box once the family has filled it", () => {
        const ec1 = roleOf(slots, "ec1_name");
        const labels = participantPersonLabels({
            parties: [],
            slots,
            needs: [answered("ec1_name", "Marisol Vega")],
        });
        const label = labels.get(personSlotKey(ec1.role, ec1.ordinal));
        expect(label?.name).toBe("Marisol Vega");
        expect(label?.role_label).toBe("Emergency contact");
        expect(label?.source).toBe("slot_answer");
    });

    it("never lets a typed box rename someone the platform already knows", () => {
        const g1 = roleOf(slots, "g1_name");
        const labels = participantPersonLabels({
            // Both roles, because that is what makes her the person in the guardian slot AND the
            // household's primary contact. A party holding only `primary_contact` fills no guardian
            // box, which is the projection owner being right rather than this module being clever.
            parties: [party({ party_id: "p1", full_name: "Kelly Kurzman", roles: ["guardian", "primary_contact"], priority: 1 })],
            slots,
            needs: [answered("g1_name", "Klly Kurzmn")],
        });
        expect(labels.get(personSlotKey(g1.role, g1.ordinal))?.name).toBe("Kelly Kurzman");
    });

    it("says nothing about a slot nobody has filled — the number is all there is", () => {
        const ec2 = roleOf(slots, "ec2_name");
        const labels = participantPersonLabels({ parties: [], slots, needs: [] });
        expect(labels.has(personSlotKey(ec2.role, ec2.ordinal))).toBe(false);
    });

    it("an objective with no party destinations at all is left exactly as it was", () => {
        expect(participantPersonLabels({}).size).toBe(0);
    });
});

/**
 * THE SCHOOL NAMED ITS EMERGENCY CONTACTS IN AN AUTHORIZATION LINE.
 *
 * "LOCAL Emergency Contact #1 Authorized adult allowed to pick my student up in case of emergency
 * or planned pick up:" classifies as `authorization`, not `name` — correctly, because that is what
 * the box asks. It is also the ONLY place this packet ever names that person, so reading only a
 * `name` attribute left every emergency contact numbered however much the family had told us.
 * Measured on the real packet: three such slots, zero `name` destinations between them.
 */
describe("a naming box is not always called name", () => {
    const authSchema = validateFormSchema({
        schema_version: 1,
        title: "Admissions Information",
        sections: [{ id: "s2", title: "Emergency Contact Information", field_ids: ["ec1_auth", "ec1_rel"] }],
        fields: [
            {
                id: "ec1_auth",
                type: "text",
                required: true,
                label: "LOCAL Emergency Contact #1 Authorized adult allowed to pick my student up in case of emergency or planned pick up:",
            },
            { id: "ec1_rel", type: "text", label: "Emergency Contact #1 Relationship to Student:", required: true },
        ],
    });

    it("reads the person out of the authorization line when there is no name box", () => {
        const authSlots = artifactPartySlots(authSchema, []);
        const auth = authSlots.find((s) => s.field_id === "ec1_auth")!;
        expect(auth.attribute).toBe("authorization");
        const labels = participantPersonLabels({
            parties: [],
            slots: authSlots,
            needs: [answered("ec1_auth", "Marisol Vega")],
        });
        const label = labels.get(personSlotKey(auth.role, auth.ordinal));
        expect(label?.name).toBe("Marisol Vega");
        expect(label?.role_label).toBe("Emergency contact");
    });

    it("still prefers a real name box where the packet has one", () => {
        const both = artifactPartySlots(
            validateFormSchema({
                schema_version: 1,
                title: "Admissions Information",
                sections: [{ id: "s3", title: "Emergency Contact Information", field_ids: ["a", "n"] }],
                fields: [
                    { id: "a", type: "text", required: true, label: "Emergency Contact #1 Authorized adult for pick up:" },
                    { id: "n", type: "text", required: true, label: "Emergency Contact #1 Name:" },
                ],
            }),
            [],
        );
        const slot = both.find((s) => s.field_id === "n")!;
        const labels = participantPersonLabels({
            parties: [],
            slots: both,
            needs: [answered("a", "the neighbour"), answered("n", "Marisol Vega")],
        });
        expect(labels.get(personSlotKey(slot.role, slot.ordinal))?.name).toBe("Marisol Vega");
    });
});

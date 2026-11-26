/**
 * The family's own guardian is a canonical binding, not a party position — and a first-name box
 * gets a first name.
 */
import { describe, expect, it } from "vitest";

import { partySlotForField } from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import { projectPartyArtifactValues } from "@/lib/enrollment/participantRuntime/projectPartyArtifactValues";
import type { FormField } from "@/lib/forms/schema";

const vocabulary = ["guardian", "emergency_contact", "authorized_pickup", "physician", "dentist"];

describe("party projection identity", () => {
    it("a box bound to the primary guardian registry is never a party slot", () => {
        const bound = { id: "app_guardian_first_name", type: "text", label: "Parent or guardian first name", field_source: { entity_type: "guardian", field_key: "guardian_first_name" } } as unknown as FormField;
        expect(partySlotForField(bound, vocabulary)).toBeNull();
        const unbound = { id: "g2_first", type: "text", label: "Parent/Guardian #2 First Name" } as unknown as FormField;
        expect(partySlotForField(unbound, vocabulary)).not.toBeNull();
    });

    it("first and last name boxes each get their own part of the person's name", () => {
        const schema = {
            fields: [
                { id: "ec1_first", type: "text", label: "Emergency Contact #1 First Name" },
                { id: "ec1_last", type: "text", label: "Emergency Contact #1 Last Name" },
                { id: "ec1_name", type: "text", label: "Emergency Contact #1 Name" },
            ],
        } as never;
        const fill = projectPartyArtifactValues(schema, [
            { party_id: "p1", person_id: "p1", roles: ["emergency_contact"], priority: 1, full_name: "Mary Ann Rivers", phone: null, email: null },
        ], vocabulary);
        expect(fill.values).toMatchObject({ ec1_first: "Mary", ec1_last: "Ann Rivers", ec1_name: "Mary Ann Rivers" });
    });
});

import { primaryHouseholdAdult } from "@/lib/enrollment/participantRuntime/resolveParticipantCanonicalValues";

describe("the household's primary adult", () => {
    it("is the flagged person, else the unique primary contact, else the unique parent — never a guess", () => {
        expect(primaryHouseholdAdult([{ person_id: "a", role_type: "parent" }, { person_id: "b", role_type: "parent", is_primary: true }])?.person_id).toBe("b");
        // An inquiry family: the adult is a primary contact without the flag (Lil' Sunshine).
        expect(primaryHouseholdAdult([{ person_id: "p", role_type: "primary_contact" }, { person_id: "e", role_type: "emergency_contact" }])?.person_id).toBe("p");
        expect(primaryHouseholdAdult([{ person_id: "m", role_type: "parent" }])?.person_id).toBe("m");
        // Two equal parents are ambiguous: asked, not chosen. A physician is never a guardian.
        expect(primaryHouseholdAdult([{ person_id: "m", role_type: "parent" }, { person_id: "f", role_type: "parent" }])).toBeNull();
        expect(primaryHouseholdAdult([{ person_id: "d", role_type: "physician" }])).toBeNull();
        expect(primaryHouseholdAdult([{ person_id: "x", role_type: "primary_contact", status: "inactive" }])).toBeNull();
    });
});

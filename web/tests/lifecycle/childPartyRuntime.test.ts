/**
 * People are canonical; artifact destinations are not.
 *
 * The live certification of the write-through runs against the cert tenant. These pin the rules a
 * unit test can own: the role vocabulary is the canonical one, provider roles need no branch, and
 * projection keeps one person's details out of another person's boxes.
 */

import { describe, expect, it } from "vitest";

import {
    isOperationalRoleKey,
    operationalRoleVocabulary,
} from "@/lib/fields/personChildRelationship/personChildRelationshipOperationalRoles";
import { validateOperationalRoleKey } from "@/lib/fields/personChildRelationship/personChildRelationshipValidation";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";
import { projectPartiesIntoSlots, type ArtifactPartySlot, type CollectedParty } from "@/lib/enrollment/participantRuntime/partySlotProjection";

describe("a configured role is a real role at the WRITE boundary", () => {
    it("accepts every role a relationship definition declares", () => {
        /*
         * `child_physicians` and `child_dentists` have been full definitions all along, and the
         * write boundary validated against the platform-FIXED constant instead — so
         * `addPersonChildRelationshipRole` answered `Unsupported operational role "physician"`.
         * That contradicts the definitions module's own promise that a new collectable role is ONE
         * definition row. Found by attaching a physician, not by reading the code.
         */
        for (const role of ["physician", "dentist"]) {
            expect(relationshipDefinitionForRole(role), `${role} is defined`).toBeTruthy();
            expect(isOperationalRoleKey(role), `${role} is in the vocabulary`).toBe(true);
            expect(validateOperationalRoleKey(role).ok, `${role} passes the write boundary`).toBe(true);
        }
    });

    it("still keeps the platform-fixed roles, and still refuses an undeclared one", () => {
        for (const role of ["guardian", "emergency_contact", "authorized_pickup", "parent"]) {
            expect(validateOperationalRoleKey(role).ok, role).toBe(true);
        }
        expect(validateOperationalRoleKey("landlord").ok).toBe(false);
        expect(operationalRoleVocabulary()).toEqual(expect.arrayContaining(["physician", "dentist", "guardian"]));
    });
});

describe("projection keeps people apart", () => {
    const party = (id: string, roles: string[], priority: number): CollectedParty => ({ party_id: id, roles, priority });
    const SLOTS: ArtifactPartySlot[] = [
        { slot_id: "g1", role: "guardian", ordinal: 1, field_ids: ["g1_phone"] },
        { slot_id: "g2", role: "guardian", ordinal: 2, field_ids: ["g2_phone"] },
        { slot_id: "e1", role: "emergency_contact", ordinal: 1, field_ids: ["e1_phone"] },
        { slot_id: "p1", role: "physician", ordinal: 1, field_ids: ["p1_phone"] },
        { slot_id: "d1", role: "dentist", ordinal: 1, field_ids: ["d1_phone"] },
        { slot_id: "ap1", role: "authorized_pickup", ordinal: 1, field_ids: ["ap1"] },
    ];

    it("gives each destination its own person and nobody else's", () => {
        // The original defect, stated as its inverse: five parties, five destinations, no crossing.
        const parties = [
            party("simone", ["guardian", "authorized_pickup"], 1),
            party("ifeoma", ["emergency_contact"], 2),
            party("alvarez", ["physician"], 3),
            party("chen", ["dentist"], 4),
        ];
        const seat = new Map(projectPartiesIntoSlots(parties, SLOTS).assignments.map((a) => [a.slot_id, a.party_id]));
        expect(seat.get("g1")).toBe("simone");
        expect(seat.get("e1")).toBe("ifeoma");
        expect(seat.get("p1")).toBe("alvarez");
        expect(seat.get("d1")).toBe("chen");
        expect(seat.get("ap1")).toBe("simone");
        // A slot with no canonical party is a truthful blank, never someone else's number.
        expect(seat.get("g2")).toBeNull();
    });

    it("reports a surplus role rather than dropping the person who holds it", () => {
        const parties = [
            party("simone", ["authorized_pickup"], 1),
            party("ifeoma", ["emergency_contact", "authorized_pickup"], 2),
        ];
        const projection = projectPartiesIntoSlots(parties, SLOTS);
        expect(projection.assignments.find((a) => a.slot_id === "ap1")!.party_id).toBe("simone");
        // Ifeoma is still an authorized pickup canonically; the artifact has one line for it.
        expect(projection.unplaced).toEqual([{ role: "authorized_pickup", party_id: "ifeoma" }]);
    });

    it("is stable across regeneration", () => {
        const parties = [party("a", ["guardian"], 1), party("b", ["guardian"], 2)];
        const once = projectPartiesIntoSlots(parties, SLOTS);
        const again = projectPartiesIntoSlots([...parties].reverse(), SLOTS);
        expect(again.assignments).toEqual(once.assignments);
    });
});

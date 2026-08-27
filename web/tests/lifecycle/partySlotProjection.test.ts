/**
 * Numbered slots are destinations, not people — proved on a Form this repository has never seen.
 *
 * The instruction's control: a Form with 2 parent slots, 4 emergency-contact slots and 1
 * authorized-pickup slot must not force a family to produce exactly those counts. The fixture is a
 * sailing-club membership form, so nothing here can be passing because of childcare field names.
 */

import { describe, expect, it } from "vitest";

import {
    artifactSlotCapacity,
    minimumPartiesRequired,
    projectPartiesIntoSlots,
    withRole,
    type ArtifactPartySlot,
    type CollectedParty,
} from "@/lib/enrollment/participantRuntime/partySlotProjection";

/** A sailing club's membership form: 2 guardian boxes, 4 emergency rows, 1 pickup line. */
const SLOTS: ArtifactPartySlot[] = [
    { slot_id: "g1", role: "guardian", ordinal: 1, field_ids: ["g1_name", "g1_phone"] },
    { slot_id: "g2", role: "guardian", ordinal: 2, field_ids: ["g2_name", "g2_phone"] },
    { slot_id: "e1", role: "emergency_contact", ordinal: 1, field_ids: ["e1_name", "e1_phone"] },
    { slot_id: "e2", role: "emergency_contact", ordinal: 2, field_ids: ["e2_name", "e2_phone"] },
    { slot_id: "e3", role: "emergency_contact", ordinal: 3, field_ids: ["e3_name", "e3_phone"] },
    { slot_id: "e4", role: "emergency_contact", ordinal: 4, field_ids: ["e4_name", "e4_phone"] },
    { slot_id: "p1", role: "authorized_pickup", ordinal: 1, field_ids: ["p1_name"] },
];

const party = (id: string, roles: string[], priority: number): CollectedParty => ({
    party_id: id,
    roles,
    priority,
});

describe("a family smaller than the form", () => {
    it("fills what it has and leaves the rest empty", () => {
        // One guardian, one emergency contact. The form's other five boxes are simply not filled —
        // nobody is invented, and nothing is refused.
        const projection = projectPartiesIntoSlots(
            [party("simone", ["guardian"], 1), party("ada", ["emergency_contact"], 1)],
            SLOTS,
        );
        const filled = projection.assignments.filter((a) => a.party_id);
        expect(filled.map((a) => a.slot_id).sort()).toEqual(["e1", "g1"]);
        expect(projection.assignments.filter((a) => !a.party_id)).toHaveLength(5);
        expect(projection.unplaced).toEqual([]);
    });

    it("requires NOTHING because the form offers a role", () => {
        /*
         * Capacity is never obligation. Four emergency rows means "this artifact can PROJECT up to
         * four", never "this family must produce one" — so with no configured semantic requirement
         * the minimum is zero and a family with no emergency contact is never walked through one.
         */
        expect(minimumPartiesRequired(SLOTS, "emergency_contact")).toBe(0);
        expect(minimumPartiesRequired(SLOTS, "guardian")).toBe(0);
        expect(artifactSlotCapacity(SLOTS, "emergency_contact"), "capacity is still four").toBe(4);
    });

    it("takes a minimum ONLY from an explicit semantic requirement", () => {
        expect(minimumPartiesRequired(SLOTS, "guardian", { required: true })).toBe(1);
        expect(minimumPartiesRequired(SLOTS, "emergency_contact", { required: true, minimum: 2 })).toBe(2);
        // A count without the requirement is not a requirement.
        expect(minimumPartiesRequired(SLOTS, "emergency_contact", { required: false, minimum: 2 })).toBe(0);
        // And a configured count above the artifact's capacity is still the truth; the artifact
        // simply cannot print them all, which `unplaced` already reports.
        expect(minimumPartiesRequired(SLOTS, "authorized_pickup", { required: true, minimum: 3 })).toBe(3);
    });
});

describe("a family larger than the form", () => {
    it("places what fits and reports the rest rather than losing them", () => {
        const parties = [1, 2, 3, 4, 5].map((n) => party(`contact${n}`, ["emergency_contact"], n));
        const projection = projectPartiesIntoSlots(parties, SLOTS);
        expect(projection.assignments.filter((a) => a.role === "emergency_contact" && a.party_id)).toHaveLength(4);
        // The fifth person stays canonically true; the artifact simply has nowhere to print them.
        expect(projection.unplaced).toEqual([{ role: "emergency_contact", party_id: "contact5" }]);
    });

    it("orders by the relationship's own priority, not by collection order", () => {
        const projection = projectPartiesIntoSlots(
            [party("second", ["emergency_contact"], 2), party("first", ["emergency_contact"], 1)],
            SLOTS,
        );
        const e1 = projection.assignments.find((a) => a.slot_id === "e1")!;
        const e2 = projection.assignments.find((a) => a.slot_id === "e2")!;
        expect(e1.party_id).toBe("first");
        expect(e2.party_id).toBe("second");
    });

    it("is stable — a regenerated artifact does not shuffle people between boxes", () => {
        const parties = [party("b", ["emergency_contact"], 1), party("a", ["emergency_contact"], 1)];
        const once = projectPartiesIntoSlots(parties, SLOTS);
        const again = projectPartiesIntoSlots([...parties].reverse(), SLOTS);
        expect(again.assignments).toEqual(once.assignments);
    });
});

describe("one person, several roles", () => {
    it("fills both a contact slot and the pickup slot without being collected twice", () => {
        /*
         * "Emergency Contact #1 Name" and "Authorized Adult Name" are two boxes. Where the evidence
         * says they are the same person they are ONE party holding two roles — which is exactly
         * what `person_child_relationship_roles` already models, many roles per relationship.
         */
        const aunt = withRole(party("aunt", ["emergency_contact"], 1), "authorized_pickup");
        expect(aunt.roles).toEqual(["emergency_contact", "authorized_pickup"]);

        const projection = projectPartiesIntoSlots([aunt], SLOTS);
        expect(projection.assignments.find((a) => a.slot_id === "e1")!.party_id).toBe("aunt");
        expect(projection.assignments.find((a) => a.slot_id === "p1")!.party_id).toBe("aunt");
    });

    it("does not merge two DIFFERENT people who happen to fill similar boxes", () => {
        const projection = projectPartiesIntoSlots(
            [party("aunt", ["emergency_contact"], 1), party("neighbour", ["authorized_pickup"], 1)],
            SLOTS,
        );
        expect(projection.assignments.find((a) => a.slot_id === "e1")!.party_id).toBe("aunt");
        expect(projection.assignments.find((a) => a.slot_id === "p1")!.party_id).toBe("neighbour");
    });
});

describe("a form with a different shape entirely", () => {
    it("needs no packet-specific code", () => {
        // Three trustee slots and no guardians at all — a Form concept this program has never seen.
        const trustDeed: ArtifactPartySlot[] = [1, 2, 3].map((n) => ({
            slot_id: `t${n}`,
            role: "trustee",
            ordinal: n,
            field_ids: [`t${n}_name`],
        }));
        const projection = projectPartiesIntoSlots(
            [party("x", ["trustee"], 1), party("y", ["trustee"], 2)],
            trustDeed,
        );
        expect(projection.assignments.filter((a) => a.party_id).map((a) => a.party_id)).toEqual(["x", "y"]);
        expect(projection.assignments.find((a) => a.slot_id === "t3")!.party_id).toBeNull();
        expect(minimumPartiesRequired(trustDeed, "trustee"), "three slots require nothing").toBe(0);
        expect(minimumPartiesRequired(trustDeed, "trustee", { required: true })).toBe(1);
    });
});

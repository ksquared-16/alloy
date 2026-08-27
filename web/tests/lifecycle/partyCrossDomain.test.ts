import { describe, expect, it } from "vitest";
import { artifactSlotsForProjection } from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import { projectPartiesIntoSlots, minimumPartiesRequired, artifactSlotCapacity } from "@/lib/enrollment/participantRuntime/partySlotProjection";
import type { FormSchemaV1 } from "@/lib/forms/schema";
const f = (id: string, label: string) => ({ id, type: "text", label });
const P = (id: string, roles: string[], priority: number) => ({ party_id: id, roles, priority });

describe("three unrelated domains, one implementation", () => {
    it("boarding kennel: owner + authorised collector", () => {
        const kennel = { fields: [f("k1","Owner #1 Name"), f("k2","Owner #1 Mobile"), f("k3","Owner #2 Name"), f("k4","Authorised Collector #1 Name"), f("k5","Authorised Collector #1 Phone")] } as unknown as FormSchemaV1;
        const slots = artifactSlotsForProjection(kennel, ["owner"]);
        const roles = [...new Set(slots.map((s) => s.role))].sort();
        console.log("  kennel roles:", JSON.stringify(roles), "| owner capacity:", artifactSlotCapacity(slots, "owner"));
        expect(roles).toContain("owner");
        expect(artifactSlotCapacity(slots, "owner"), "two owner lines, three boxes").toBe(2);
        /*
         * "Authorised Collector" groups as its OWN role, not as `authorized_pickup`.
         *
         * The canonical `detection_patterns` are American-spelled ("authorized", "pickup"), so a
         * British form's collector is not recognised as the canonical pickup role. The fallback
         * still groups it correctly, so it never broadcasts — but no canonical relationship can be
         * written for it. The fix is one word in that definition's `detection_patterns`, which is
         * the "one definition row" mechanism working as designed; it is NOT a synonym list in
         * participant runtime, so it is reported rather than patched here.
         */
        expect(roles).toContain("authorised_collector");
    });

    it("sailing club: guardian / emergency / pickup, one person in two roles", () => {
        const club = { fields: [f("s1","Parent or Guardian #1 Name"), f("s2","Parent or Guardian #1 Phone"), f("s3","Emergency Contact #1 Name"), f("s4","Emergency Contact #1 Phone"), f("s5","Authorized pickup adult #1 Name")] } as unknown as FormSchemaV1;
        const slots = artifactSlotsForProjection(club, []);
        const roles = [...new Set(slots.map((s) => s.role))].sort();
        console.log("  club roles:", JSON.stringify(roles));
        const proj = projectPartiesIntoSlots([P("mum", ["guardian", "authorized_pickup"], 1), P("gran", ["emergency_contact"], 2)], slots);
        const seat = new Map(proj.assignments.map((a) => [a.role + "#" + a.ordinal, a.party_id]));
        console.log("  club seating:", JSON.stringify([...seat]));
        expect(seat.get("guardian#1")).toBe("mum");
        expect(seat.get("authorized_pickup#1")).toBe("mum");
        expect(seat.get("emergency_contact#1")).toBe("gran");
    });

    it("trust deed: trustees, capacity three, requirement zero", () => {
        const deed = { fields: [f("t1","Trustee #1 Name"), f("t2","Trustee #1 Email"), f("t3","Trustee #2 Name"), f("t4","Trustee #3 Name")] } as unknown as FormSchemaV1;
        const slots = artifactSlotsForProjection(deed, ["trustee"]);
        console.log("  trustee capacity:", artifactSlotCapacity(slots, "trustee"), "| required:", minimumPartiesRequired(slots, "trustee"));
        expect(artifactSlotCapacity(slots, "trustee")).toBe(3);
        expect(minimumPartiesRequired(slots, "trustee")).toBe(0);
        const proj = projectPartiesIntoSlots([P("x", ["trustee"], 1)], slots);
        expect(proj.assignments.filter((a) => a.party_id)).toHaveLength(1);
        expect(proj.unplaced).toEqual([]);
    });
});

/** A member the family started must be finished — even in an optional group, because submit refuses it. */
import { describe, expect, it } from "vitest";
import { collectionPrompt, collectionsAwaitingMembers } from "@/lib/enrollment/participantRuntime/collectionsAwaitingMembers";

const artifact = (value: unknown, required: boolean) => ({ sections: [{ controls: [{ field_id: "g", label: "Other parents or guardians", participant_label: null, input_type: "group", required, value }] }] }) as never;

describe("collectionsAwaitingMembers", () => {
    it("awaits an optional group holding an incomplete member", () => {
        expect(collectionsAwaitingMembers(artifact({ complete: 0, needed: 0, started: 1 }, false))).toEqual([{ fieldId: "g", label: "Other parents or guardians", complete: 0, needed: 1 }]);
    });
    it("leaves an optional group with nobody started, and a satisfied required one, alone", () => {
        expect(collectionsAwaitingMembers(artifact({ complete: 0, needed: 0, started: 0 }, false))).toEqual([]);
        expect(collectionsAwaitingMembers(artifact({ complete: 2, needed: 1, started: 2 }, true))).toEqual([]);
    });
});

describe("optional medical collections are offered once (ZZQAV5082106: a family had no way to add insurance)", () => {
    const optional = (value: unknown) => ({ sections: [{ controls: [{ field_id: "ins", label: "Health insurance (if applicable)", participant_label: null, input_type: "group", required: false, value }] }] }) as never;
    it("an empty optional insurance group is offered, skippable", () => {
        const [c] = collectionsAwaitingMembers(optional({ complete: 0, needed: 0, offer_optional: true }));
        expect(c).toMatchObject({ fieldId: "ins", optional: true, needed: 0 });
        expect(collectionPrompt(c!)).toEqual({ title: "Health insurance", detail: "Optional — add one if it applies, or skip." });
    });
    it("once a row exists it is finished like any member; once complete it is not offered again", () => {
        expect(collectionsAwaitingMembers(optional({ complete: 0, needed: 0, started: 1, offer_optional: true }))).toMatchObject([{ needed: 1 }]);
        expect(collectionsAwaitingMembers(optional({ complete: 1, needed: 0, offer_optional: true }))).toEqual([]);
    });
    it("a non-medical optional collection is still not offered", () => {
        expect(collectionsAwaitingMembers(optional({ complete: 0, needed: 0 }))).toEqual([]);
    });
});

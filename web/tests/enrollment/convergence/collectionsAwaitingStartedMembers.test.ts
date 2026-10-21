/** A member the family started must be finished — even in an optional group, because submit refuses it. */
import { describe, expect, it } from "vitest";
import { collectionsAwaitingMembers } from "@/lib/enrollment/participantRuntime/collectionsAwaitingMembers";

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

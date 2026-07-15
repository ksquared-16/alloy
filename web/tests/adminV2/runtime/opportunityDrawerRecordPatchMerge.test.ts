import { describe, expect, it } from "vitest";

import { mergeOpportunityDrawerDisplayRecordPatch } from "@/lib/admin/opportunityDrawerTargetedRefresh";

describe("mergeOpportunityDrawerDisplayRecordPatch", () => {
    it("preserves prev-only keys and deep-merges _person_address_by_id", () => {
        const prev = {
            id: "opp-1",
            keep_me: true,
            _person_address_by_id: {
                "p-1": { address_line1: "Old", city: "Old City" },
            },
        };
        const incoming = {
            id: "opp-1",
            "person.primary_address_line1": "New Street",
            _person_address_by_id: {
                "p-1": { address_line1: "New Street", state: "OR" },
            },
        };
        const merged = mergeOpportunityDrawerDisplayRecordPatch(prev, incoming);
        expect(merged.keep_me).toBe(true);
        expect((merged._person_address_by_id as Record<string, Record<string, unknown>>)["p-1"]).toEqual({
            address_line1: "New Street",
            city: "Old City",
            state: "OR",
        });
    });
});

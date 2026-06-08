import { describe, expect, it } from "vitest";
import { collectLinkedPersonIdsFromOpportunityRecord } from "@/lib/admin/drawer/collectLinkedPersonIdsFromOpportunityRecord";

const PRIMARY = "11111111-1111-4111-8111-111111111111";
const LINKED = "22222222-2222-4222-8222-222222222222";

describe("collectLinkedPersonIdsFromOpportunityRecord", () => {
    it("collects primary person and opportunity_persons rows", () => {
        const ids = collectLinkedPersonIdsFromOpportunityRecord({
            primary_person_id: PRIMARY,
            _opportunity_persons: [
                { id: "row-1", person_id: LINKED },
                { id: "row-2", person_id: PRIMARY },
            ],
        });
        expect(ids.sort()).toEqual([LINKED, PRIMARY].sort());
    });

    it("reads primary from _identity.primary_person.id", () => {
        const ids = collectLinkedPersonIdsFromOpportunityRecord({
            _identity: { primary_person: { id: PRIMARY } },
        });
        expect(ids).toEqual([PRIMARY]);
    });

    it("collects inquiry child person ids", () => {
        const CHILD = "33333333-3333-4333-8333-333333333333";
        const ids = collectLinkedPersonIdsFromOpportunityRecord({
            _inquiry_children: [{ person_id: CHILD, first_name: "Sophia" }],
        });
        expect(ids).toEqual([CHILD]);
    });
});

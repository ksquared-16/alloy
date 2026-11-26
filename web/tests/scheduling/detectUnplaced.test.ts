import { describe, expect, it } from "vitest";
import {
    selectUnplacedAgreements,
    type UnplacedAgreementLite,
} from "@/lib/scheduling/problems/detectUnplaced";

function agreement(id: string): UnplacedAgreementLite {
    return {
        id,
        customer_member_id: `cm-${id}`,
        person_id: `p-${id}`,
        site_location_id: "site-1",
        start_date: "2026-07-28",
    };
}

describe("selectUnplacedAgreements", () => {
    it("returns agreements with no operational schedule assignment", () => {
        const agreements = [agreement("a1"), agreement("a2"), agreement("a3")];
        const placed = new Set(["a2"]);
        const unplaced = selectUnplacedAgreements(agreements, placed);
        expect(unplaced.map((a) => a.id)).toEqual(["a1", "a3"]);
    });

    it("returns all when none are scheduled", () => {
        const agreements = [agreement("a1"), agreement("a2")];
        expect(selectUnplacedAgreements(agreements, new Set())).toHaveLength(2);
    });

    it("returns none when all are scheduled", () => {
        const agreements = [agreement("a1")];
        expect(selectUnplacedAgreements(agreements, new Set(["a1"]))).toHaveLength(0);
    });
});

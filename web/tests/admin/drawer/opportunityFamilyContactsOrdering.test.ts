import { describe, expect, it } from "vitest";

import {
    isPrimaryContactRoleType,
    resolveLeadSummaryPrimaryPersonId,
    sortOpportunityFamilyContactRows,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";

describe("opportunityFamilyContactsOrdering", () => {
    it("prefers opportunities.primary_person_id over linked rows", () => {
        expect(
            resolveLeadSummaryPrimaryPersonId({
                primary_person_id: "person-a",
                _opportunity_persons: [{ person_id: "person-b", role_type: "primary_contact" }],
            })
        ).toBe("person-a");
    });

    it("falls back to linked primary_contact role when FK is unset", () => {
        expect(
            resolveLeadSummaryPrimaryPersonId({
                _opportunity_persons: [
                    { person_id: "person-b", role_type: "family_member" },
                    { person_id: "person-a", role_type: "primary_contact" },
                ],
            })
        ).toBe("person-a");
    });

    it("sorts primary-contact roles before other linked people", () => {
        const sorted = sortOpportunityFamilyContactRows(
            [
                { person_id: "p2", role_type: "family_member", name: "B" },
                { person_id: "p3", role_type: "primary_contact", name: "C" },
                { person_id: "p4", role_type: "guardian", name: "A" },
            ],
            "p1"
        );
        expect(sorted.map((r) => r.person_id)).toEqual(["p3", "p2", "p4"]);
        expect(isPrimaryContactRoleType("primary_contact")).toBe(true);
    });
});

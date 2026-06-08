import { describe, expect, it } from "vitest";

import {
    buildOpportunityFamilyContactRows,
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

    it("falls back to household customer_persons primary contact when FK is unset", () => {
        expect(
            resolveLeadSummaryPrimaryPersonId({
                customer_id: "cust-1",
                _customer_persons: [
                    {
                        customer_id: "cust-1",
                        person_id: "person-household",
                        role_type: "primary_contact",
                        is_primary: true,
                    },
                ],
            })
        ).toBe("person-household");
    });

    it("falls back to linked primary_contact role when FK and household rows are unset", () => {
        expect(
            resolveLeadSummaryPrimaryPersonId({
                _opportunity_persons: [
                    { person_id: "person-b", role_type: "family_member" },
                    { person_id: "person-a", role_type: "primary_contact" },
                ],
            })
        ).toBe("person-a");
    });

    it("merges household customer_persons guardians into additional contacts", () => {
        const rows = buildOpportunityFamilyContactRows({
            customer_id: "cust-1",
            primary_person_id: "p-primary",
            _opportunity_persons: [{ id: "1", person_id: "p-primary", role_type: "primary_contact", name: "Primary" }],
            _customer_persons: [
                {
                    customer_id: "cust-1",
                    person_id: "p-primary",
                    role_type: "primary_contact",
                    is_primary: true,
                    name: "Primary",
                },
                {
                    customer_id: "cust-1",
                    person_id: "p-other",
                    role_type: "guardian",
                    is_primary: false,
                    name: "Other Guardian",
                },
            ],
        });
        const additional = sortOpportunityFamilyContactRows(rows, "p-primary");
        expect(additional.map((r) => r.person_id)).toEqual(["p-other"]);
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

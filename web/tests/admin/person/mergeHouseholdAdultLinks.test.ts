import { describe, expect, it } from "vitest";
import { mergeHouseholdAdultLinks } from "@/lib/admin/person/mergeHouseholdAdultLinks";
import type { PersonHouseholdAdultLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

describe("mergeHouseholdAdultLinks", () => {
    it("collapses Rivera-style duplicate role rows for one adult", () => {
        const rows: PersonHouseholdAdultLinkRow[] = [
            {
                person_id: "ava-1",
                customer_id: "cust-rivera",
                display_name: "Ava Rivera",
                role_type: "parent",
                role_label: "Parent",
                is_primary: true,
                is_household_primary_contact: true,
            },
            {
                person_id: "ava-1",
                customer_id: "cust-rivera",
                display_name: "Ava Rivera",
                role_type: "guardian",
                role_label: "Guardian",
                is_primary: false,
                is_household_primary_contact: false,
            },
            {
                person_id: "ava-1",
                customer_id: "cust-rivera",
                display_name: "Ava Rivera",
                role_type: "primary_contact",
                role_label: "Primary contact",
                is_primary: false,
                is_household_primary_contact: false,
            },
        ];

        const merged = mergeHouseholdAdultLinks(rows);
        expect(merged).toHaveLength(1);
        expect(merged[0]?.person_id).toBe("ava-1");
        expect(merged[0]?.is_primary).toBe(true);
        expect(merged[0]?.role_label).toContain("Parent");
    });

    it("keeps distinct adults on the same household", () => {
        const rows: PersonHouseholdAdultLinkRow[] = [
            {
                person_id: "ava-1",
                customer_id: "cust-rivera",
                display_name: "Ava Rivera",
                role_type: "parent",
                role_label: "Parent",
                is_primary: true,
                is_household_primary_contact: true,
            },
            {
                person_id: "jordan-1",
                customer_id: "cust-rivera",
                display_name: "Jordan Rivera",
                role_type: "guardian",
                role_label: "Guardian",
                is_primary: false,
                is_household_primary_contact: false,
            },
        ];
        expect(mergeHouseholdAdultLinks(rows)).toHaveLength(2);
    });
});

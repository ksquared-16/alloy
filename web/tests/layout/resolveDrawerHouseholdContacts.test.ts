/**
 * Drawer household contacts resolver — Lead/Person shared projection.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    DRAWER_HOUSEHOLD_CONTACTS_MAX_VISIBLE,
    resolveOpportunityDrawerHouseholdContacts,
    resolvePersonDrawerHouseholdContacts,
} from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";

describe("resolveOpportunityDrawerHouseholdContacts", () => {
    it("includes primary contact and guardian adults sorted with guardians first", () => {
        const projection = resolveOpportunityDrawerHouseholdContacts({
            id: "opp-1",
            customer_id: "cust-1",
            "person.primary_contact_name": "Jamie Johnson",
            "person.primary_phone": "555-111-2222",
            "opportunity.primary_person_id": "person-primary",
            _opportunity_persons: [
                {
                    id: "op-1",
                    person_id: "person-primary",
                    role_type: "primary_contact",
                    name: "Jamie Johnson",
                    phone: "555-111-2222",
                },
                {
                    id: "op-2",
                    person_id: "person-guardian",
                    role_type: "guardian",
                    name: "Alex Johnson",
                    phone: "555-333-4444",
                },
                {
                    id: "op-3",
                    person_id: "person-emergency",
                    role_type: "emergency_contact",
                    name: "Pat Lee",
                },
            ],
        });

        expect(projection.contacts.map((row) => row.display_name)).toEqual([
            "Jamie Johnson",
            "Alex Johnson",
            "Pat Lee",
        ]);
        expect(projection.contacts[0]?.is_primary).toBe(true);
        expect(projection.contacts[1]?.role_label).toMatch(/guardian/i);
    });

    it("produces +N more when contact count exceeds the visible cap", () => {
        const people = Array.from({ length: DRAWER_HOUSEHOLD_CONTACTS_MAX_VISIBLE + 2 }, (_, index) => ({
            id: `op-${index}`,
            person_id: `person-${index}`,
            role_type: index === 0 ? "primary_contact" : "guardian",
            name: `Contact ${index}`,
        }));

        const projection = resolveOpportunityDrawerHouseholdContacts({
            id: "opp-1",
            customer_id: "cust-1",
            "opportunity.primary_person_id": "person-0",
            "person.primary_contact_name": "Contact 0",
            _opportunity_persons: people,
        });

        expect(projection.visible).toHaveLength(DRAWER_HOUSEHOLD_CONTACTS_MAX_VISIBLE);
        expect(projection.overflowCount).toBe(2);
    });

    it("merges household adult links not present on opportunity_persons", () => {
        const projection = resolveOpportunityDrawerHouseholdContacts({
            id: "opp-1",
            customer_id: "cust-1",
            "opportunity.primary_person_id": "person-primary",
            "person.primary_contact_name": "Jamie Johnson",
            _opportunity_persons: [
                {
                    id: "op-1",
                    person_id: "person-primary",
                    role_type: "primary_contact",
                    name: "Jamie Johnson",
                },
            ],
            _household_adult_links: [
                {
                    customer_id: "cust-1",
                    person_id: "person-guardian",
                    display_name: "Alex Johnson",
                    role_type: "guardian",
                    role_label: "Guardian",
                    is_primary: false,
                    is_household_primary_contact: false,
                },
            ],
        });

        expect(projection.contacts.map((row) => row.display_name)).toContain("Alex Johnson");
    });
});

describe("resolvePersonDrawerHouseholdContacts", () => {
    it("includes related adults and excludes the viewing person", () => {
        const record = buildProofPersonRecord({
            id: "parent-1",
            _household_context: [{ customer_id: "cust-1", customer_name: "Johnson Household" }],
            _household_adult_links: [
                {
                    customer_id: "cust-1",
                    person_id: "parent-1",
                    display_name: "Jamie Johnson",
                    role_type: "parent",
                    role_label: "Parent",
                    is_primary: true,
                    is_household_primary_contact: true,
                },
                {
                    customer_id: "cust-1",
                    person_id: "parent-2",
                    display_name: "Alex Johnson",
                    role_type: "guardian",
                    role_label: "Guardian",
                    is_primary: false,
                    is_household_primary_contact: false,
                },
            ],
        });

        const projection = resolvePersonDrawerHouseholdContacts(record);
        expect(projection.contacts.map((row) => row.display_name)).toEqual(["Alex Johnson"]);
    });
});

describe("lead drawer default doc (household contacts widget)", () => {
    it("includes household_contacts widget in household section", () => {
        const leadDoc = buildLeadDrawerDefaultDoc();
        const household = leadDoc.sections.find((s) => s.key === "household_contact");
        const widgetKeys =
            household?.rows.flatMap((row) => row.columns.flatMap((col) => col.items.map((item) => item.refKey))) ??
            [];
        expect(widgetKeys).toContain("household_contacts");
    });
});

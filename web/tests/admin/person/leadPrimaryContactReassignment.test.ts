import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import { applyHouseholdPrimaryContactToRecord } from "@/lib/admin/person/applyHouseholdPrimaryContactToRecord";
import { applyLeadPrimaryContactToOpportunityRecord } from "@/lib/admin/person/applyLeadPrimaryContactToOpportunityRecord";
import { buildQueueRowDisplayPatchFromLeadPrimaryContact } from "@/lib/admin/person/buildQueueRowDisplayPatchFromLeadPrimaryContact";
import {
    customerPersonRowIsHouseholdPrimaryContact,
    HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
} from "@/lib/admin/person/householdPrimaryContact";
import { resolveLeadDrawerHeaderContext } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";
import { resolveOpportunityDrawerHouseholdContacts } from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";

const baseOpportunityRecord = {
    id: "opp-1",
    customer_id: "cust-1",
    primary_person_id: "person-kelly",
    "person.primary_contact_name": "Kelly Mitchell",
    "person.primary_phone": "555-111-2222",
    "person.primary_email": "kelly@example.com",
    _opportunity_persons: [
        {
            id: "op-1",
            person_id: "person-kelly",
            role_type: "primary_contact",
            name: "Kelly Mitchell",
            phone: "555-111-2222",
            email: "kelly@example.com",
        },
        {
            id: "op-2",
            person_id: "person-kevin",
            role_type: "guardian",
            name: "Kevin Mitchell",
            phone: "555-333-4444",
            email: "kevin@example.com",
        },
    ],
    _customer_persons: [
        {
            customer_id: "cust-1",
            person_id: "person-kelly",
            role_type: HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
            is_primary: true,
        },
        {
            customer_id: "cust-1",
            person_id: "person-kevin",
            role_type: "guardian",
            is_primary: false,
        },
    ],
    _household_adult_links: [
        {
            customer_id: "cust-1",
            person_id: "person-kelly",
            display_name: "Kelly Mitchell",
            role_type: HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
            is_primary: true,
            is_household_primary_contact: true,
        },
        {
            customer_id: "cust-1",
            person_id: "person-kevin",
            display_name: "Kevin Mitchell",
            role_type: "guardian",
            is_primary: false,
            is_household_primary_contact: false,
        },
    ],
};

describe("lead primary contact reassignment", () => {
    it("create lead intake sets first entered adult as default primary", () => {
        const lead = readFileSync(join(process.cwd(), "lib/forms/intake/applyFormLeadCaptureIntake.ts"), "utf8");
        expect(lead).toContain("primary_person_id: personId");
        expect(lead).toContain("ensureCustomerPersonsPrimaryLink");
        expect(typeof ensureCustomerPersonsPrimaryLink).toBe("function");
    });

    it("applyLeadPrimaryContactToOpportunityRecord updates drawer VM primary person and contact fields", () => {
        const next = applyLeadPrimaryContactToOpportunityRecord(baseOpportunityRecord, "cust-1", "person-kevin");

        expect(next.primary_person_id).toBe("person-kevin");
        expect(next["person.primary_contact_name"]).toBe("Kevin Mitchell");
        expect(next["person.primary_email"]).toBe("kevin@example.com");

        const projection = resolveOpportunityDrawerHouseholdContacts(next);
        expect(projection.primaryPersonId).toBe("person-kevin");
        expect(projection.contacts.find((row) => row.person_id === "person-kevin")?.is_primary).toBe(true);
        expect(projection.contacts.find((row) => row.person_id === "person-kelly")?.is_primary).toBe(false);
    });

    it("only one household primary contact remains after reassignment", () => {
        const next = applyLeadPrimaryContactToOpportunityRecord(baseOpportunityRecord, "cust-1", "person-kevin");

        const cpRows = next._customer_persons as {
            person_id?: string;
            is_primary?: boolean;
            role_type?: string;
        }[];
        const primaryRows = cpRows.filter((row) =>
            customerPersonRowIsHouseholdPrimaryContact({
                role_type: row.role_type,
                is_primary: row.is_primary,
            })
        );
        expect(primaryRows).toHaveLength(1);
        expect(primaryRows[0]?.person_id).toBe("person-kevin");

        const adultLinks = next._household_adult_links as { person_id: string; is_household_primary_contact: boolean }[];
        expect(adultLinks.filter((row) => row.is_household_primary_contact)).toHaveLength(1);
        expect(adultLinks.find((row) => row.is_household_primary_contact)?.person_id).toBe("person-kevin");
    });

    it("queue and header display mirrors use the new primary contact", () => {
        const next = applyLeadPrimaryContactToOpportunityRecord(baseOpportunityRecord, "cust-1", "person-kevin");

        const header = resolveLeadDrawerHeaderContext(next);
        expect(header.primaryContactLabel).toBe("Kevin Mitchell");
        expect(header.contactLine).toContain("kevin@example.com");

        const queuePatch = buildQueueRowDisplayPatchFromLeadPrimaryContact(next);
        expect(queuePatch.primary_contact_line).toBe("Kevin Mitchell");
        expect(queuePatch.primary_email).toBe("kevin@example.com");
    });

    it("applyHouseholdPrimaryContactToRecord demotes prior primary on customer_persons rows", () => {
        const next = applyHouseholdPrimaryContactToRecord(baseOpportunityRecord, "cust-1", "person-kevin");
        const cpRows = next._customer_persons as {
            person_id?: string;
            is_primary?: boolean;
            role_type?: string;
        }[];
        expect(
            cpRows.find((row) => row.person_id === "person-kelly" && row.is_primary === false)
        ).toBeTruthy();
        expect(
            cpRows.find(
                (row) =>
                    row.person_id === "person-kevin"
                    && customerPersonRowIsHouseholdPrimaryContact({
                        role_type: row.role_type,
                        is_primary: row.is_primary,
                    })
            )
        ).toBeTruthy();
    });

    it("lead drawer UI wires make-primary action and existing PATCH route", () => {
        const widget = readFileSync(
            join(process.cwd(), "components/layout/lead/LeadHouseholdContactsWidget.tsx"),
            "utf8"
        );
        expect(widget).toContain("patchLeadHouseholdPrimaryContact");
        expect(widget).toContain("LeadHouseholdPrimaryContactConfirmModal");
        expect(widget).toContain("currentPrimaryName");

        const cards = readFileSync(
            join(process.cwd(), "components/layout/DrawerHouseholdContactCardList.tsx"),
            "utf8"
        );
        expect(cards).toContain("Make primary contact");
        expect(cards).toContain("data-drawer-household-primary-contact-badge");

        const patch = readFileSync(join(process.cwd(), "lib/admin/person/patchHouseholdPrimaryContact.ts"), "utf8");
        expect(patch).toContain("/household-primary-contact");

        const ebAction = readFileSync(
            join(process.cwd(), "lib/admin/actions/makePrimaryContactAction.ts"),
            "utf8"
        );
        expect(ebAction).toContain("make_primary_contact");
    });

});

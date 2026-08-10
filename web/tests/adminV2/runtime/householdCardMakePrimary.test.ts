import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyLeadPrimaryContactToOpportunityRecord } from "@/lib/admin/person/applyLeadPrimaryContactToOpportunityRecord";
import {
    customerPersonRowIsHouseholdPrimaryContact,
    HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
} from "@/lib/admin/person/householdPrimaryContact";
import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const baseOpportunityRecord = {
    id: "opp-1",
    customer_id: "cust-1",
    primary_person_id: "person-kelly",
    "person.primary_contact_name": "Kelly Kurzman",
    "person.primary_phone": "555-111-2222",
    "person.primary_email": "kelly@example.com",
    _opportunity_persons: [
        {
            id: "op-1",
            person_id: "person-kelly",
            role_type: "primary_contact",
            name: "Kelly Kurzman",
            phone: "555-111-2222",
            email: "kelly@example.com",
        },
        {
            id: "op-2",
            person_id: "person-kristi",
            role_type: "guardian",
            name: "Kristi Kurzman",
            phone: "555-333-4444",
            email: "kristi@example.com",
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
            person_id: "person-kristi",
            role_type: "guardian",
            is_primary: false,
        },
    ],
    _household_adult_links: [
        {
            customer_id: "cust-1",
            person_id: "person-kelly",
            display_name: "Kelly Kurzman",
            role_type: HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
            is_primary: true,
            is_household_primary_contact: true,
        },
        {
            customer_id: "cust-1",
            person_id: "person-kristi",
            display_name: "Kristi Kurzman",
            role_type: "guardian",
            is_primary: false,
            is_household_primary_contact: false,
        },
    ],
};

function evidencePrimaryName(record: Record<string, unknown>): string | null {
    const context = {
        truth: record,
        subject: { id: "opp-1", label: "Kurzman" },
    } as OperationalContext;
    return buildHouseholdCardEvidence(context).primaryContact?.name ?? null;
}

describe("Household card — Make primary wiring", () => {
    it("uses canonical confirm modal + mutation seam (not a client-only toggle)", () => {
        const card = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/cards/HouseholdCard.tsx"),
            "utf8",
        );
        expect(card).toContain("LeadHouseholdPrimaryContactConfirmModal");
        expect(card).toContain("makeHouseholdPrimaryContact");
        expect(card).toContain("data-household-make-primary-contact");
        expect(card).toContain("householdShowsPrimaryContactControl");
        expect(card).toContain("alloy-os-household__primary-badge");
        // Summary-card tertiary text control — muted by default, Bend Pine on hover/focus.
        expect(card).toContain("text-alloy-slate");
        expect(card).toContain("hover:text-alloy-bend-pine");
        expect(card).toContain("focus-visible:text-alloy-bend-pine");
        expect(card).not.toContain("text-alloy-blue hover:underline");
    });

    it("Focus Panel mutation delegates to patchHouseholdPrimaryContact + record refresh", () => {
        const mutation = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelMutation.ts"),
            "utf8",
        );
        expect(mutation).toContain("makeHouseholdPrimaryContact");
        expect(mutation).toContain("patchHouseholdPrimaryContact");
        expect(mutation).toContain("applyLeadPrimaryContactToOpportunityRecord");
        expect(mutation).toContain("dispatchOpportunityDrawerRecordPatch");
    });

    it("confirm modal uses ActionModalOverlayShell + Bend Pine (not legacy blue modal)", () => {
        const modal = readFileSync(
            join(process.cwd(), "components/layout/lead/LeadHouseholdPrimaryContactConfirmModal.tsx"),
            "utf8",
        );
        expect(modal).toContain("ActionModalOverlayShell");
        expect(modal).toContain("bg-alloy-bend-pine");
        expect(modal).toContain("text-alloy-midnight");
        expect(modal).toContain("text-alloy-slate");
        expect(modal).toContain("New primary");
        expect(modal).toContain("will become the primary contact");
        expect(modal).toContain("will remain a household contact");
        expect(modal).not.toContain("bg-alloy-blue");
        expect(modal).not.toContain("bg-black/50");
        expect(modal).not.toContain("Affected scope");
        expect(modal).not.toContain("make_primary_contact");
        expect(modal).not.toContain("person_id");
    });
});

describe("Household primary flip-back (A→B→A)", () => {
    it("optimistic apply keeps flip-back primary name and demotes prior primary role", () => {
        const toKristi = applyLeadPrimaryContactToOpportunityRecord(
            baseOpportunityRecord,
            "cust-1",
            "person-kristi",
        );
        expect(toKristi.primary_person_id).toBe("person-kristi");
        expect(evidencePrimaryName(toKristi)).toBe("Kristi Kurzman");

        const kellyCp = (toKristi._customer_persons as { person_id?: string; role_type?: string; is_primary?: boolean }[])
            .find((row) => row.person_id === "person-kelly");
        expect(kellyCp?.is_primary).toBe(false);
        expect(
            customerPersonRowIsHouseholdPrimaryContact({
                role_type: kellyCp?.role_type,
                is_primary: kellyCp?.is_primary,
            }),
        ).toBe(false);

        const backToKelly = applyLeadPrimaryContactToOpportunityRecord(
            toKristi,
            "cust-1",
            "person-kelly",
        );
        expect(backToKelly.primary_person_id).toBe("person-kelly");
        expect(backToKelly["person.primary_contact_name"]).toBe("Kelly Kurzman");
        expect(evidencePrimaryName(backToKelly)).toBe("Kelly Kurzman");

        const primaryRows = (backToKelly._customer_persons as {
            person_id?: string;
            role_type?: string;
            is_primary?: boolean;
        }[]).filter((row) =>
            customerPersonRowIsHouseholdPrimaryContact({
                role_type: row.role_type,
                is_primary: row.is_primary,
            }),
        );
        expect(primaryRows).toHaveLength(1);
        expect(primaryRows[0]?.person_id).toBe("person-kelly");
    });

    it("flip-back still restores name when prior primary only remains on adult links", () => {
        const adultOnlyKelly = {
            ...baseOpportunityRecord,
            _opportunity_persons: [
                {
                    id: "op-2",
                    person_id: "person-kristi",
                    role_type: "primary_contact",
                    name: "Kristi Kurzman",
                    phone: "555-333-4444",
                    email: "kristi@example.com",
                },
            ],
            primary_person_id: "person-kristi",
            "person.primary_contact_name": "Kristi Kurzman",
            _customer_persons: [
                {
                    customer_id: "cust-1",
                    person_id: "person-kristi",
                    role_type: HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
                    is_primary: true,
                },
            ],
            _household_adult_links: [
                {
                    customer_id: "cust-1",
                    person_id: "person-kelly",
                    display_name: "Kelly Kurzman",
                    role_type: "guardian",
                    is_primary: false,
                    is_household_primary_contact: false,
                    phone: "555-111-2222",
                    email: "kelly@example.com",
                },
                {
                    customer_id: "cust-1",
                    person_id: "person-kristi",
                    display_name: "Kristi Kurzman",
                    role_type: HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
                    is_primary: true,
                    is_household_primary_contact: true,
                },
            ],
        };

        const backToKelly = applyLeadPrimaryContactToOpportunityRecord(
            adultOnlyKelly,
            "cust-1",
            "person-kelly",
        );
        expect(backToKelly.primary_person_id).toBe("person-kelly");
        expect(backToKelly["person.primary_contact_name"]).toBe("Kelly Kurzman");
        expect(evidencePrimaryName(backToKelly)).toBe("Kelly Kurzman");
    });
});

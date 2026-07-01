import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BOOKING_CUSTOMER_PERSON_ROLE_TYPE, ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import { resolveLeadSummaryPrimaryPersonId } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import {
    customerPersonRowIsHouseholdPrimaryContact,
    resolveHouseholdPrimaryContactPersonIdFromRows,
} from "@/lib/admin/person/householdPrimaryContact";
import { filterPersonDrawerHouseholdVisibilityBySiteScope } from "@/lib/admin/person/personDrawerHouseholdSiteScope";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";

describe("household primary contact helpers", () => {
    it("identifies primary contact only from role_type primary_contact + is_primary", () => {
        expect(
            customerPersonRowIsHouseholdPrimaryContact({
                role_type: "primary_contact",
                is_primary: true,
            })
        ).toBe(true);
        expect(
            customerPersonRowIsHouseholdPrimaryContact({
                role_type: "parent",
                is_primary: true,
            })
        ).toBe(false);
        expect(
            customerPersonRowIsHouseholdPrimaryContact({
                role_type: "primary_contact",
                is_primary: false,
            })
        ).toBe(false);
    });

    it("resolves household primary contact per customer from customer_persons rows", () => {
        const rows = [
            {
                customer_id: "cust-a",
                person_id: "person-a",
                role_type: "primary_contact",
                is_primary: true,
            },
            {
                customer_id: "cust-b",
                person_id: "person-a",
                role_type: "guardian",
                is_primary: false,
            },
        ];
        expect(resolveHouseholdPrimaryContactPersonIdFromRows(rows, "cust-a")).toBe("person-a");
        expect(resolveHouseholdPrimaryContactPersonIdFromRows(rows, "cust-b")).toBe(null);
    });

    it("intake links use primary_contact role type constant", () => {
        expect(BOOKING_CUSTOMER_PERSON_ROLE_TYPE).toBe("primary_contact");
        const src = readFileSync(join(process.cwd(), "lib/bookingCustomerPersonLink.ts"), "utf8");
        expect(src).toContain("is_primary: false");
        expect(src).toContain('eq("role_type", roleType)');
        expect(typeof ensureCustomerPersonsPrimaryLink).toBe("function");
    });
});

describe("opportunity and queue primary contact source", () => {
    it("resolveLeadSummaryPrimaryPersonId prefers FK then household customer_persons", () => {
        expect(
            resolveLeadSummaryPrimaryPersonId({
                primary_person_id: "person-fk",
                customer_id: "cust-1",
                _customer_persons: [
                    {
                        customer_id: "cust-1",
                        person_id: "person-cp",
                        role_type: "primary_contact",
                        is_primary: true,
                    },
                ],
            })
        ).toBe("person-fk");

        expect(
            resolveLeadSummaryPrimaryPersonId({
                customer_id: "cust-1",
                _customer_persons: [
                    {
                        customer_id: "cust-1",
                        person_id: "person-cp",
                        role_type: "primary_contact",
                        is_primary: true,
                    },
                ],
            })
        ).toBe("person-cp");
    });

    it("opportunity hydrate falls back to household primary on customer_id", () => {
        const src = readFileSync(join(process.cwd(), "lib/admin/opportunityEntityRecord.ts"), "utf8");
        expect(src).toContain("resolveCustomerHouseholdPrimaryContactPersonId");
    });

    it("queue enrich uses opportunities.primary_person_id for contact line", () => {
        const src = readFileSync(join(process.cwd(), "lib/queues/QueueService.ts"), "utf8");
        expect(src).toContain("_primary_contact_line: contactName");
        expect(src).toMatch(/primary_person_id[\s\S]{0,200}personById/);
    });

    it("intake sets primary_person_id and ensureCustomerPersonsPrimaryLink", () => {
        const lead = readFileSync(join(process.cwd(), "lib/forms/intake/applyFormLeadCaptureIntake.ts"), "utf8");
        expect(lead).toContain("primary_person_id: personId");
        expect(lead).toContain("ensureCustomerPersonsPrimaryLink");
    });
});

describe("parent drawer household primary per customer", () => {
    it("shows Primary badge only for household primary contact, not parent is_primary alone", () => {
        const model = resolvePersonDrawerHouseholdModel({
            _household_context: [
                { customer_id: "cust-a", customer_name: "Household A" },
                { customer_id: "cust-b", customer_name: "Household B" },
            ],
            _household_adult_links: [
                {
                    person_id: "person-1",
                    customer_id: "cust-a",
                    display_name: "Alex",
                    role_type: "primary_contact",
                    role_label: "Primary contact",
                    is_primary: true,
                    is_household_primary_contact: true,
                },
                {
                    person_id: "person-1",
                    customer_id: "cust-b",
                    display_name: "Alex",
                    role_type: "guardian",
                    role_label: "Guardian",
                    is_primary: false,
                    is_household_primary_contact: false,
                },
            ],
        });
        const groupA = model.groups.find((g) => g.customer_id === "cust-a");
        const groupB = model.groups.find((g) => g.customer_id === "cust-b");
        expect(groupA?.guardians[0]?.role_chips).toEqual(["Primary"]);
        expect(groupB?.guardians[0]?.role_chips).toEqual(["Guardian"]);
    });
});

describe("child location from enrollment mirror", () => {
    it("uses enrollment mirror for program and location — not person fields", () => {
        const summary = resolvePersonDrawerChildSummaryModel({
            first_name: "Riley",
            last_name: "Chen",
            _enrollment_mirror: [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    opportunity_name: "Chen lead",
                    opportunity_status_key: "contact_attempted",
                    opportunity_status_label: "Contact Attempted",
                    customer_member_id: "member-1",
                    child_display_name: "Riley Chen",
                    location_id: "loc-site-a",
                    location_label: "Downtown Campus",
                    program_label: "Preschool",
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
        });
        expect(summary.program_label).toBe("Preschool");
        expect(summary.location_label).toBe("Downtown Campus");
        const src = readFileSync(
            join(process.cwd(), "lib/admin/person/personDrawerChildSummaryModel.ts"),
            "utf8"
        );
        expect(src).not.toContain("school_location");
    });
});

describe("site-scoped household visibility", () => {
    it("filters household to customers with enrollment at allowed sites only", () => {
        const out: Record<string, unknown> = {
            _household_context: [
                { customer_id: "cust-a", customer_name: "A" },
                { customer_id: "cust-b", customer_name: "B" },
            ],
            _household_child_links: [
                {
                    customer_member_id: "m-a",
                    customer_id: "cust-a",
                    person_id: "child-a",
                    display_name: "Child A",
                },
                {
                    customer_member_id: "m-b",
                    customer_id: "cust-b",
                    person_id: "child-b",
                    display_name: "Child B",
                },
            ],
            _household_adult_links: [
                {
                    person_id: "parent-1",
                    customer_id: "cust-a",
                    display_name: "Parent A",
                    role_type: "primary_contact",
                    role_label: null,
                    is_primary: true,
                    is_household_primary_contact: true,
                },
                {
                    person_id: "parent-1",
                    customer_id: "cust-b",
                    display_name: "Parent A",
                    role_type: "guardian",
                    role_label: null,
                    is_primary: false,
                    is_household_primary_contact: false,
                },
            ],
            _enrollment_mirror: [
                {
                    id: "ocm-a",
                    opportunity_id: "opp-a",
                    opportunity_name: null,
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "m-a",
                    child_display_name: "Child A",
                    location_id: "site-a",
                    location_label: "Site A",
                    program_label: null,
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
                {
                    id: "ocm-b",
                    opportunity_id: "opp-b",
                    opportunity_name: null,
                    opportunity_status_key: null,
                    opportunity_status_label: null,
                    customer_member_id: "m-b",
                    child_display_name: "Child B",
                    location_id: "site-b",
                    location_label: "Site B",
                    program_label: null,
                    room_label: null,
                    outcome_status_key: null,
                    outcome_status_label: null,
                },
            ],
        };

        filterPersonDrawerHouseholdVisibilityBySiteScope(out, {
            departmentScope: "all",
            allowedDepartmentIds: [],
            siteScope: "restricted",
            allowedSiteLocationIds: ["site-a"],
        });

        expect((out._household_context as { customer_id: string }[]).map((r) => r.customer_id)).toEqual([
            "cust-a",
        ]);
        expect(
            (out._household_child_links as { customer_member_id: string }[]).map((r) => r.customer_member_id)
        ).toEqual(["m-a"]);
        expect((out._enrollment_mirror as { location_id: string }[]).map((r) => r.location_id)).toEqual([
            "site-a",
        ]);
    });

    it("attachPersonDrawerVisibility applies site scope filter at projection", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/admin/person/attachPersonDrawerVisibility.ts"),
            "utf8"
        );
        expect(src).toContain("filterPersonDrawerHouseholdVisibilityBySiteScope");
        expect(src).toContain("location_id: siteId");
    });
});

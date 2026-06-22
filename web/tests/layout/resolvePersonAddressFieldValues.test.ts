/**
 * Person address field resolution for layout runtime records.
 */

import { describe, expect, it } from "vitest";
import {
    buildPersonAddressIndexFromVm,
    overlayContactRolePersonAddressFields,
    resolveContactRolePersonAddressFieldValues,
    resolvePersonAddressFieldValues,
} from "@/lib/layout/runtime/resolvePersonAddressFieldValues";
import { buildPersonLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm";
import { buildOpportunityLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm";

describe("resolvePersonAddressFieldValues", () => {
    it("maps bare person field_values keys to person.address_* refKeys", () => {
        const values = resolvePersonAddressFieldValues({
            address_line1: "100 Main St",
            city: "Austin",
            state: "TX",
            postal_code: "78701",
        });
        expect(values["person.address_line1"]).toBe("100 Main St");
        expect(values["person.city"]).toBe("Austin");
        expect(values["person.state"]).toBe("TX");
        expect(values["person.postal_code"]).toBe("78701");
    });

    it("buildPersonLayoutRuntimeRecordFromVm overlays person address separately from household address", () => {
        const record = buildPersonLayoutRuntimeRecordFromVm({
            personId: "person-1",
            vmRecord: {
                first_name: "Jordan",
                last_name: "Nguyen",
                address_line1: "200 Person Lane",
                city: "Austin",
                _household_customer_addresses: [
                    {
                        customer_id: "cust-1",
                        location_id: "loc-1",
                        address_line1: "500 Household Rd",
                        city: "Austin",
                        state: "TX",
                        postal_code: "78702",
                    },
                ],
            },
        });
        expect(record["person.address_line1"]).toBe("200 Person Lane");
        expect(record["location.household_address_line1"]).toBe("500 Household Rd");
    });

    it("resolveContactRolePersonAddressFieldValues projects role-scoped address refs", () => {
        const values = resolveContactRolePersonAddressFieldValues({
            vmRecord: {
                _primary_person_id: "p-primary",
                _opportunity_persons: [
                    {
                        person_id: "p-primary",
                        address_line1: "10 Primary Ave",
                        city: "Austin",
                    },
                    {
                        person_id: "p-secondary",
                        address_line1: "20 Secondary Ave",
                    },
                ],
            },
            primaryPersonId: "p-primary",
            secondaryPersonId: "p-secondary",
            emergencyPersonId: null,
            billingPersonId: null,
        });
        expect(values["person.primary_address_line1"]).toBe("10 Primary Ave");
        expect(values["person.primary_address_city"]).toBe("Austin");
        expect(values["person.secondary_address_line1"]).toBe("20 Secondary Ave");
    });

    it("buildOpportunityLayoutRuntimeRecordFromVm includes contact role address projections", () => {
        const record = buildOpportunityLayoutRuntimeRecordFromVm({
            opportunityId: "opp-1",
            vmRecord: {
                name: "Nguyen Household",
                _primary_person_id: "p-primary",
                _primary_contact_name: "Jordan Nguyen",
                _opportunity_persons: [
                    {
                        person_id: "p-primary",
                        name: "Jordan Nguyen",
                        role_type: "primary_contact",
                        address_line1: "10 Primary Ave",
                    },
                ],
            },
        });
        expect(record["person.primary_address_line1"]).toBe("10 Primary Ave");
    });

    it("buildPersonAddressIndexFromVm prefers explicit snapshots", () => {
        const index = buildPersonAddressIndexFromVm({
            _person_address_by_id: {
                "person-x": { address_line1: "Snapshot St" },
            },
        });
        expect(index.get("person-x")?.address_line1).toBe("Snapshot St");
    });

    it("overlayContactRolePersonAddressFields uses role prefix", () => {
        expect(
            overlayContactRolePersonAddressFields("emergency", {
                address_line1: "911 Lane",
                postal_code: "78701",
            }),
        ).toEqual({
            "person.emergency_address_line1": "911 Lane",
            "person.emergency_address_postal_code": "78701",
        });
    });
});

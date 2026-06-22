import { describe, expect, it } from "vitest";
import { resolveHouseholdAddressFieldValues } from "@/lib/layout/runtime/resolveHouseholdAddressFieldValues";

describe("resolveHouseholdAddressFieldValues", () => {
    it("maps customer address row components to layout ref keys", () => {
        const values = resolveHouseholdAddressFieldValues({
            _household_customer_addresses: [
                {
                    address_line1: "142 Oak Street",
                    address_line2: "Apt 2",
                    city: "Austin",
                    state: "TX",
                    postal_code: "78701",
                },
            ],
        });
        expect(values["location.household_address_line1"]).toBe("142 Oak Street");
        expect(values["location.household_address_line2"]).toBe("Apt 2");
        expect(values["location.household_address_city"]).toBe("Austin");
        expect(values["location.household_address_state"]).toBe("TX");
        expect(values["location.household_address_postal_code"]).toBe("78701");
        expect(values["location.household_address"]).toContain("142 Oak Street");
    });
});

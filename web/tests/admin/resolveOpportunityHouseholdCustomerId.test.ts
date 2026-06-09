import { describe, expect, it } from "vitest";
import { resolveOpportunityHouseholdCustomerId } from "@/lib/admin/resolveOpportunityHouseholdCustomerId";

describe("resolveOpportunityHouseholdCustomerId", () => {
    it("prefers top-level customer_id", () => {
        expect(
            resolveOpportunityHouseholdCustomerId({
                customer_id: "cust-1",
                _identity: { household: { id: "cust-2" } },
            }),
        ).toBe("cust-1");
    });

    it("falls back to _identity.household.id", () => {
        expect(
            resolveOpportunityHouseholdCustomerId({
                _identity: { household: { id: "cust-2", label: "Lee family" } },
            }),
        ).toBe("cust-2");
    });

    it("returns null when no household id", () => {
        expect(resolveOpportunityHouseholdCustomerId({})).toBeNull();
        expect(resolveOpportunityHouseholdCustomerId(null)).toBeNull();
    });
});

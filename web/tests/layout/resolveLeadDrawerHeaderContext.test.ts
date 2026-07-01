import { describe, expect, it } from "vitest";
import { resolveLeadDrawerHeaderContext } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";

describe("resolveLeadDrawerHeaderContext", () => {
    it("reads primary contact and household from layout runtime record fields", () => {
        const ctx = resolveLeadDrawerHeaderContext({
            "person.primary_contact_name": "Jamie Mitchell",
            "person.primary_email": "jamie@example.com",
            "person.primary_phone": "(541) 555-0100",
            _customer_name: "Mitchell Household",
        });
        expect(ctx.primaryContactLabel).toBe("Jamie Mitchell");
        expect(ctx.contactLine).toBe("jamie@example.com · (541) 555-0100");
        expect(ctx.householdLabel).toBe("Mitchell Household");
    });

    it("falls back to identity primary person label", () => {
        const ctx = resolveLeadDrawerHeaderContext({
            _identity: {
                primary_person: { label: "Taylor Johnson" },
                household: { label: "Johnson Household" },
            },
        });
        expect(ctx.primaryContactLabel).toBe("Taylor Johnson");
        expect(ctx.householdLabel).toBe("Johnson Household");
    });
});

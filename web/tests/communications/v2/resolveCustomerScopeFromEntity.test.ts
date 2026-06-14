import { describe, it, expect } from "vitest";
import { entityKind, resolveCustomerScopeFromEntity } from "@/lib/communications/v2/familyWorkspace/resolveCustomerScopeFromEntity";

describe("entityKind", () => {
    it("normalizes drawer entity types", () => {
        expect(entityKind("opportunities")).toBe("opportunity");
        expect(entityKind("opportunity")).toBe("opportunity");
        expect(entityKind("persons")).toBe("person");
        expect(entityKind("children")).toBe("child");
        expect(entityKind("customer_members")).toBe("child");
        expect(entityKind("customers")).toBe("customer");
        expect(entityKind("jobs")).toBe("unknown");
        expect(entityKind(null)).toBe("unknown");
    });
});

// chainable mock returning configured rows per table
function mockSupabase(routes: Record<string, (filters: Record<string, unknown>) => unknown>) {
    return {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (k: string, v: unknown) => { filters[k] = v; return api; },
                limit: () => Promise.resolve({ data: routes[table]?.(filters) ?? null }),
                maybeSingle: () => Promise.resolve({ data: routes[table]?.(filters) ?? null }),
            };
            return api;
        },
    } as unknown as Parameters<typeof resolveCustomerScopeFromEntity>[0];
}

describe("resolveCustomerScopeFromEntity", () => {
    it("customer -> direct", async () => {
        const out = await resolveCustomerScopeFromEntity(mockSupabase({}), "o1", "customer", "cust-1");
        expect(out).toMatchObject({ customerId: "cust-1" });
    });
    it("opportunity -> customer_id + focusOpportunityId", async () => {
        const out = await resolveCustomerScopeFromEntity(mockSupabase({ opportunities: () => ({ customer_id: "cust-9" }) }), "o1", "opportunities", "opp-1");
        expect(out).toMatchObject({ customerId: "cust-9", focusOpportunityId: "opp-1" });
    });
    it("child -> customer_id + focusChildId", async () => {
        const out = await resolveCustomerScopeFromEntity(mockSupabase({ customer_members: () => ({ customer_id: "cust-3" }) }), "o1", "children", "cm-1");
        expect(out).toMatchObject({ customerId: "cust-3", focusChildId: "cm-1" });
    });
    it("person -> customer_persons; falls back to child member", async () => {
        const asAdult = await resolveCustomerScopeFromEntity(mockSupabase({ customer_persons: () => [{ customer_id: "cust-2" }] }), "o1", "persons", "p-mom");
        expect(asAdult).toMatchObject({ customerId: "cust-2", focusPersonId: "p-mom" });
        const asChild = await resolveCustomerScopeFromEntity(mockSupabase({ customer_persons: () => [], customer_members: () => [{ id: "cm-7", customer_id: "cust-5" }] }), "o1", "persons", "p-child");
        expect(asChild).toMatchObject({ customerId: "cust-5", focusChildId: "cm-7" });
    });
    it("unknown -> no customer", async () => {
        const out = await resolveCustomerScopeFromEntity(mockSupabase({}), "o1", "jobs", "j-1");
        expect(out.customerId).toBeNull();
    });
});

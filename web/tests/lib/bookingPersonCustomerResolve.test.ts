import { describe, expect, it, vi, beforeEach } from "vitest";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";

const ensureCustomerPersonsPrimaryLink = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/bookingCustomerPersonLink", () => ({
    ensureCustomerPersonsPrimaryLink: (...args: unknown[]) => ensureCustomerPersonsPrimaryLink(...args),
}));

vi.mock("@/lib/persons/findOrCreatePersonInOrg", () => ({
    findOrCreatePersonInOrg: vi.fn(),
    findOrCreatePersonInOrgWithMeta: vi.fn(),
}));

/**
 * Builds a Supabase test double for the ensureCustomerForPersonNative happy path:
 * persons lookup → no existing customer_persons link → customers insert.
 * `onCustomerInsert` captures the exact payload written to `customers`.
 */
function supabaseForEnsureCustomer(opts: {
    onCustomerInsert: (payload: Record<string, unknown>) => void;
    customerInsertResult?: { data: { id: string } | null; error: { message?: string; code?: string } | null };
}) {
    const result = opts.customerInsertResult ?? { data: { id: "cust-1" }, error: null };
    return {
        from: vi.fn((table: string) => {
            if (table === "persons") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue({
                                data: {
                                    id: "person-1",
                                    first_name: "Ada",
                                    last_name: "Lovelace",
                                    email: "ada@example.com",
                                    phone: null,
                                    org_id: "org-1",
                                },
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === "customer_persons") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            limit: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "customers") {
                return {
                    insert: vi.fn((payload: Record<string, unknown>) => {
                        opts.onCustomerInsert(payload);
                        return {
                            select: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue(result),
                            }),
                        };
                    }),
                };
            }
            return { select: vi.fn(), insert: vi.fn() };
        }),
    };
}

describe("ensureCustomerForPersonNative — customers insert payload", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does NOT write the legacy `status` column on customers insert", async () => {
        let captured: Record<string, unknown> | null = null;
        const sb = supabaseForEnsureCustomer({ onCustomerInsert: (p) => (captured = p) });

        await ensureCustomerForPersonNative(sb as never, "person-1", {
            org_id: "org-1",
            vertical_id: "vert-1",
            household_name: "Lovelace Family",
        });

        expect(captured).not.toBeNull();
        // Regression for PGRST204: customers.status was dropped from the live schema.
        expect(captured!).not.toHaveProperty("status");
    });

    it("writes household status to the canonical customers.status_key column", async () => {
        let captured: Record<string, unknown> | null = null;
        const sb = supabaseForEnsureCustomer({ onCustomerInsert: (p) => (captured = p) });

        await ensureCustomerForPersonNative(sb as never, "person-1", {
            org_id: "org-1",
            household_name: "Lovelace Family",
        });

        expect(captured!.status_key).toBe("active");
    });

    it("succeeds against the current schema shape and returns the new customer id", async () => {
        const sb = supabaseForEnsureCustomer({ onCustomerInsert: () => {} });

        const res = await ensureCustomerForPersonNative(sb as never, "person-1", {
            org_id: "org-1",
            household_name: "Lovelace Family",
        });

        expect(res.customer_id).toBe("cust-1");
        expect(ensureCustomerPersonsPrimaryLink).toHaveBeenCalledWith(
            sb,
            expect.objectContaining({ customerId: "cust-1", personId: "person-1", orgId: "org-1" })
        );
    });

    it("throws a PGRST204-tagged error the executor can detect when the schema rejects the insert", async () => {
        const sb = supabaseForEnsureCustomer({
            onCustomerInsert: () => {},
            customerInsertResult: {
                data: null,
                error: {
                    message: "Could not find the 'status' column of 'customers' in the schema cache",
                    code: "PGRST204",
                },
            },
        });

        await expect(
            ensureCustomerForPersonNative(sb as never, "person-1", { org_id: "org-1" })
        ).rejects.toThrow(/PGRST204/);
    });
});

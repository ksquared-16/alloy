import { describe, expect, it } from "vitest";
import { applyCustomerMemberMutationPatch } from "@/lib/admin/customerMemberPatch";

function supabase(args: { exists?: boolean; updateError?: string; configDefError?: string } = {}) {
    const calls: unknown[] = [];
    const exists = args.exists ?? true;
    return {
        calls,
        from(table: string) {
            calls.push({ table, op: "from" });
            return {
                select() {
                    return {
                        eq() { return this; },
                        maybeSingle: async () => {
                            calls.push({ op: "select-member", exists });
                            if (args.configDefError) return { data: null, error: { message: args.configDefError } };
                            return { data: exists ? { id: "cm-1" } : null, error: null };
                        },
                        in: () => ({
                            eq() { return this; },
                            then(resolve: (v: { data: { field_key: string }[]; error: null }) => void) {
                                resolve({ data: [{ field_key: "gender" }], error: null });
                            },
                        }),
                    };
                },
                update(patch: Record<string, unknown>) {
                    calls.push({ op: "update", patch });
                    return {
                        eq() { return this; },
                        then(resolve: (v: { error: { message: string } | null }) => void) {
                            resolve({ error: args.updateError ? { message: args.updateError } : null });
                        },
                    };
                },
            };
        },
    };
}

describe("applyCustomerMemberMutationPatch", () => {
    it("uses the same native patch path as customer member PATCH for first_name", async () => {
        const db = supabase();
        const result = await applyCustomerMemberMutationPatch({
            supabase: db as never,
            orgId: "org-1",
            memberId: "cm-1",
            body: { first_name: "Sam" },
        });
        expect(result.ok).toBe(true);
        expect(db.calls).toContainEqual({ op: "update", patch: { first_name: "Sam" } });
    });

    it("partitions config fields to field_values upsert path", async () => {
        const db = supabase();
        const result = await applyCustomerMemberMutationPatch({
            supabase: db as never,
            orgId: "org-1",
            memberId: "cm-1",
            body: { gender: "female" },
        });
        expect(result.ok).toBe(true);
    });

    it("rejects unsupported fields with the same validation contract", async () => {
        const result = await applyCustomerMemberMutationPatch({
            supabase: supabase() as never,
            orgId: "org-1",
            memberId: "cm-1",
            body: { preferred_language: "Spanish" },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("Unsupported fields");
    });
});

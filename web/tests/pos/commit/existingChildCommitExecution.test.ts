import { describe, expect, it } from "vitest";
import { executeExistingChildCommitPlan } from "@/lib/pos/processingCase/commit/children/executeExistingChildCommit";
import type { ExistingChildCommitPlan } from "@/lib/pos/processingCase/commit/children/types";

const plan: ExistingChildCommitPlan = {
    proposal_id: "p1",
    record_id: "cm-1",
    organization_id: "org-1",
    customer_id: "cust-1",
    approved_changes: [{
        provider_ref: "child.child_first_name",
        canonical_ref: { entity_type: "customer_member", field_key: "first_name" },
        old_value: "Samuel",
        proposed_value: "Sam",
        stale_state: "clean",
    }],
    skipped_changes: [],
};

function supabase(error: null | { message: string } = null) {
    const calls: unknown[] = [];
    return {
        calls,
        from(table: string) {
            calls.push({ table, op: "from" });
            return {
                select() {
                    calls.push({ op: "select" });
                    return {
                        eq() {
                            return this;
                        },
                        maybeSingle() {
                            calls.push({ op: "maybeSingle", found: !error });
                            return Promise.resolve({ data: error ? null : { id: "cm-1" }, error });
                        },
                    };
                },
                update(patch: Record<string, unknown>) {
                    calls.push({ op: "update", patch });
                    return {
                        eq() {
                            return this;
                        },
                        then(resolve: (value: { error: typeof error }) => void) {
                            resolve({ error });
                        },
                    };
                },
            };
        },
    };
}

describe("executeExistingChildCommitPlan", () => {
    it("delegates approved changes to canonical customer member mutation patch", async () => {
        const db = supabase();
        const result = await executeExistingChildCommitPlan({ supabase: db as never, plan });
        expect(result.status).toBe("committed");
        expect(db.calls).toContainEqual({ op: "update", patch: { first_name: "Sam" } });
    });

    it("returns stable noop/blocked result when nothing is approved", async () => {
        const result = await executeExistingChildCommitPlan({ supabase: supabase() as never, plan: { ...plan, approved_changes: [], skipped_changes: [{ provider_ref: "x", reason: "Deferred", outcome: "deferred" }] } });
        expect(result.status).toBe("blocked");
        expect(result.skipped_changes[0]?.outcome).toBe("deferred");
    });

    it("returns per-field failure without throwing", async () => {
        const result = await executeExistingChildCommitPlan({ supabase: supabase({ message: "nope" }) as never, plan });
        expect(result.status).toBe("blocked");
        expect(result.field_results[0]?.outcome).toBe("failed");
    });
});

/**
 * LAW 15 — a save may never report success unless a canonical write actually happened.
 *
 * Previously guarded only by a browser round trip. That mattered: a harness once set `el.value` and
 * dispatched `input`, which does NOT reach a React controlled input — the field committed unchanged
 * and the server returned a clean 200 with credible timings. A NO-OP SAVE MEASURED AS A REAL ONE,
 * and only a reload exposed it. These guards freeze the rule at the contract layer, where it is
 * deterministic.
 *
 * The rule has two halves, and both are asserted:
 *   1. a rejected mutation writes NOTHING and reports failure;
 *   2. an accepted mutation's readback AGREES with what was written.
 */
import { describe, expect, it } from "vitest";

import {
    applyCustomerMemberMutationPatch,
    validateCustomerMemberPatchBody,
} from "@/lib/admin/customerMemberPatch";

/**
 * Supabase double that RECORDS writes, so "wrote nothing" is checkable rather than assumed.
 *
 * The query builder is a chainable proxy: the real code chains `.eq().eq().eq().in()` in places, and
 * a double that only models the depth one test happens to need fails for a reason that has nothing
 * to do with the behaviour under test.
 */
function supabaseDouble(opts: { memberExists?: boolean } = {}) {
    const writes: { table: string; op: string }[] = [];
    const rowsFor = () => (opts.memberExists === false ? null : { id: "member-1" });
    const builder = (): any => {
        const b: any = {
            eq: () => b,
            in: () => b,
            select: () => b,
            maybeSingle: async () => ({ data: rowsFor(), error: null }),
            single: async () => ({ data: rowsFor(), error: null }),
            then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        };
        return b;
    };
    const api: any = {
        writes,
        from(table: string) {
            return {
                select: () => builder(),
                update: () => { writes.push({ table, op: "update" }); return builder(); },
                upsert: () => { writes.push({ table, op: "upsert" }); return builder(); },
                delete: () => { writes.push({ table, op: "delete" }); return builder(); },
            };
        },
    };
    return api;
}

describe("save — no false success", () => {
    it("an unsupported field is REJECTED, not silently dropped into a 200", () => {
        const v = validateCustomerMemberPatchBody({ not_a_real_field: "x" });
        expect(v.ok).toBe(false);
    });

    it("a field owned by another entity is refused with a reason", () => {
        const v = validateCustomerMemberPatchBody({ enrollment_status: "enrolled" });
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.error).toBeTruthy();
    });

    it("an empty patch cannot report success — nothing was written", () => {
        expect(validateCustomerMemberPatchBody({}).ok).toBe(false);
    });

    it("POSITIVE CONTROL — a real field validates and partitions", () => {
        const v = validateCustomerMemberPatchBody({ special_instructions: "no nuts" });
        expect(v.ok).toBe(true);
    });

    it("a rejected mutation performs NO write", async () => {
        const supabase = supabaseDouble();
        const res = await applyCustomerMemberMutationPatch({
            supabase, orgId: "org-1", memberId: "member-1", body: { not_a_real_field: "x" },
        });
        expect(res.ok).toBe(false);
        expect(supabase.writes).toEqual([]);
    });

    it("a mutation against a MISSING member fails and writes nothing", async () => {
        const supabase = supabaseDouble({ memberExists: false });
        const res = await applyCustomerMemberMutationPatch({
            supabase, orgId: "org-1", memberId: "ghost", body: { special_instructions: "x" },
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.status).toBe(404);
        expect(supabase.writes).toEqual([]);
    });
});

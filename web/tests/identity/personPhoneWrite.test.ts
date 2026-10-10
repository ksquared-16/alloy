/**
 * E2E-16 — one stored form for one phone number, at the person write boundary every intake path
 * (Create Lead, Processing commit, Forms, Add Person, relationship creates) passes through.
 */
import { describe, expect, it } from "vitest";

import { normalizePhoneForPersonWrite, personPhoneMatchValues } from "@/lib/identity";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";

function fakePersons(existing: Array<{ id: string; org_id: string; phone: string | null; email: string | null }>) {
    const inserts: Array<Record<string, unknown>> = [];
    const client = {
        from() {
            const f: { eq: Record<string, unknown>; in?: { col: string; vals: unknown[] }; ilike?: [string, string] } = { eq: {} };
            const chain: Record<string, unknown> = {
                select: () => chain,
                eq: (c: string, v: unknown) => ((f.eq[c] = v), chain),
                in: (c: string, vals: unknown[]) => ((f.in = { col: c, vals }), chain),
                ilike: (c: string, v: string) => ((f.ilike = [c, v]), chain),
                limit: () => chain,
                maybeSingle: async () => {
                    const row = existing.find((r) =>
                        Object.entries(f.eq).every(([k, v]) => (r as Record<string, unknown>)[k] === v)
                        && (!f.in || f.in.vals.includes((r as Record<string, unknown>)[f.in.col]))
                        && (!f.ilike || String((r as Record<string, unknown>)[f.ilike[0]] ?? "").toLowerCase() === f.ilike[1].toLowerCase()),
                    );
                    return { data: row ? { id: row.id } : null, error: null };
                },
                insert: (payload: Record<string, unknown>) => {
                    inserts.push(payload);
                    const ins: Record<string, unknown> = { select: () => ins, single: async () => ({ data: { id: `new-${inserts.length}` }, error: null }) };
                    return ins;
                },
            };
            return chain;
        },
    };
    return { client: client as never, inserts };
}

const create = (supabase: never, phone: string) =>
    findOrCreatePersonInOrgWithMeta(supabase, { email: null, phone, first_name: "Yara", last_name: "ZZQA", org_id: "org" });

describe("normalizePhoneForPersonWrite", () => {
    it("stores equivalent US numbers identically, as E.164", () => {
        for (const raw of ["5555550146", "(555) 555-0146", "555-555-0146", " +1 555 555 0146 "]) {
            expect(normalizePhoneForPersonWrite(raw)).toBe("+15555550146");
        }
    });
    it("leaves unparseable input as typed (no new rejection) and empty as null", () => {
        expect(normalizePhoneForPersonWrite("call me")).toBe("call me");
        expect(normalizePhoneForPersonWrite("   ")).toBeNull();
        expect(normalizePhoneForPersonWrite(null)).toBeNull();
    });
    it("matches every legacy shape plus the canonical form", () => {
        const v = personPhoneMatchValues("(555) 555-0146");
        expect(v).toEqual(expect.arrayContaining(["+15555550146", "5555550146", "(555) 555-0146", "555-555-0146"]));
    });
});

describe("findOrCreatePersonInOrgWithMeta — the shared write boundary", () => {
    it("the three Human QA inputs persist the same canonical value", async () => {
        for (const raw of ["5555550146", "(555) 555-0146", "555-555-0146"]) {
            const f = fakePersons([]);
            await create(f.client, raw);
            expect(f.inserts[0]?.phone).toBe("+15555550146");
        }
    });
    it("finds a person stored before the rule in a legacy format — no duplicate", async () => {
        const f = fakePersons([{ id: "legacy", org_id: "org", phone: "(555) 555-0146", email: null }]);
        expect(await create(f.client, "5555550146")).toEqual({ id: "legacy", created: false });
        expect(f.inserts).toHaveLength(0);
    });
    it("finds a person stored canonically when typed formatted", async () => {
        const f = fakePersons([{ id: "canon", org_id: "org", phone: "+15555550146", email: null }]);
        expect(await create(f.client, "555-555-0146")).toEqual({ id: "canon", created: false });
    });
});

/**
 * W7-F023 — GENERATED TUITION BINDS RESPONSIBILITY AT CREATION, THROUGH THE CANONICAL RESOLVER.
 *
 * Observed on staging: Tilly Tuition's generated $1,200 draft read "Not allocated" under a 100% Tess
 * Tuition arrangement, while Add Charge binds who owes a charge the moment it is created (it sequences
 * `billing.resolve_responsibility` after `charge.add`). Generation never called the resolver.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { planTuitionResponsibility } from "@/lib/financials/tuitionGeneration/tuitionResponsibility";
import { resolveResponsibilitySplit } from "@/lib/financials/responsibility/resolveResponsibilitySplit";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const ORG = "o";
const HH = "hh";
const KID = "kid";

/** Reads only — the preview path writes nothing, and this fake has no write methods to call. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
    return {
        from: (table: string) => {
            const filters: Array<[string, unknown]> = [];
            const ins: Array<[string, unknown[]]> = [];
            const rows = () =>
                (tables[table] ?? []).filter(
                    (r) => filters.every(([k, v]) => r[k] === v) && ins.every(([k, vs]) => vs.includes(r[k])),
                );
            const chain: Record<string, unknown> = {
                select: () => chain,
                eq: (k: string, v: unknown) => (filters.push([k, v]), chain),
                in: (k: string, vs: unknown[]) => (ins.push([k, vs]), chain),
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (resolve: (x: unknown) => unknown) => resolve({ data: rows(), error: null }),
            };
            return chain;
        },
    } as never;
}

const agreement = { id: "agr", org_id: ORG, customer_id: HH, customer_member_id: KID };
const arrangement = (id: string, over: Record<string, unknown> = {}) => ({
    id, org_id: ORG, customer_id: HH, customer_member_id: null, charge_id: null,
    effective_start: "2026-09-01", effective_end: null, state: "active", ...over,
});
const share = (id: string, arr: string, party: string, over: Record<string, unknown>) => ({
    id, org_id: ORG, arrangement_id: arr, responsible_party_id: party, priority: 100, amount_cents: null, percent_basis_points: null, ...over,
});
const persons = [
    { id: "tess", org_id: ORG, full_name: "Tess Tuition" },
    { id: "dana", org_id: ORG, full_name: "Dana Split" },
    { id: "rosa", org_id: ORG, full_name: "Rosa Split" },
];
const plan = (db: never, netCents = 120000) =>
    planTuitionResponsibility(db, { orgId: ORG, agreementId: "agr", serviceDate: "2026-11-01", netCents });

describe("what generated tuition binds — the canonical arrangement read and split, previewed", () => {
    it("single party: Tess Tuition · 100% · $1,200.00", async () => {
        const db = fakeDb({
            child_enrollment_agreements: [agreement],
            financial_responsibility_arrangements: [arrangement("a1")],
            financial_responsibility_shares: [share("s1", "a1", "tess", { method: "percentage", percent_basis_points: 10000 })],
            persons,
        });
        expect(await plan(db)).toEqual({
            status: "resolved",
            arrangementId: "a1",
            parties: [{ partyId: "tess", name: "Tess Tuition", share: "100%", assignedCents: 120000 }],
        });
    });

    it("split 60/40 divides exactly, with no rounding drift on an odd amount", async () => {
        const db = fakeDb({
            child_enrollment_agreements: [agreement],
            financial_responsibility_arrangements: [arrangement("a2")],
            financial_responsibility_shares: [
                share("s1", "a2", "dana", { method: "percentage", percent_basis_points: 6000 }),
                share("s2", "a2", "rosa", { method: "percentage", percent_basis_points: 4000 }),
            ],
            persons,
        });
        const r = await plan(db, 120001);
        expect(r.status).toBe("resolved");
        const parties = (r as { parties: Array<{ name: string; share: string; assignedCents: number }> }).parties;
        expect(parties.map((p) => `${p.name} ${p.share}`)).toEqual(["Dana Split 60%", "Rosa Split 40%"]);
        expect(parties.reduce((n, p) => n + p.assignedCents, 0), "total responsibility = net").toBe(120001);
        /* The preview's numbers ARE the resolver's split — the same function, the same answer. */
        const direct = resolveResponsibilitySplit({
            netCents: 120001,
            shares: [
                { shareId: "s1", responsiblePartyId: "dana", method: "percentage", percentBasisPoints: 6000, amountCents: null, priority: 100 },
                { shareId: "s2", responsiblePartyId: "rosa", method: "percentage", percentBasisPoints: 4000, amountCents: null, priority: 100 },
            ],
        });
        expect(direct.kind === "allocated" ? direct.allocations.map((a) => a.assignedAmountCents) : null).toEqual(parties.map((p) => p.assignedCents));
    });

    it("a child-specific arrangement beats the household's", async () => {
        const db = fakeDb({
            child_enrollment_agreements: [agreement],
            financial_responsibility_arrangements: [arrangement("hh-arr"), arrangement("kid-arr", { customer_member_id: KID })],
            financial_responsibility_shares: [
                share("s1", "hh-arr", "dana", { method: "percentage", percent_basis_points: 10000 }),
                share("s2", "kid-arr", "tess", { method: "percentage", percent_basis_points: 10000 }),
            ],
            persons,
        });
        expect(await plan(db)).toMatchObject({ status: "resolved", arrangementId: "kid-arr", parties: [{ name: "Tess Tuition" }] });
    });

    it("an arrangement not yet in force on the service date does not bind", async () => {
        const db = fakeDb({
            child_enrollment_agreements: [agreement],
            financial_responsibility_arrangements: [arrangement("late", { effective_start: "2026-12-01" })],
            financial_responsibility_shares: [share("s1", "late", "tess", { method: "percentage", percent_basis_points: 10000 })],
            persons,
        });
        expect((await plan(db)).status).toBe("none");
    });

    it("no responsible party: said plainly — the charge will read Not allocated, as Add Charge's would", async () => {
        const db = fakeDb({ child_enrollment_agreements: [agreement], financial_responsibility_arrangements: [], financial_responsibility_shares: [], persons });
        expect(await plan(db)).toMatchObject({ status: "none", detail: expect.stringMatching(/Not allocated/) });
    });

    it("an arrangement that cannot divide the charge is refused with the resolver's reason", async () => {
        const db = fakeDb({
            child_enrollment_agreements: [agreement],
            financial_responsibility_arrangements: [arrangement("bad")],
            financial_responsibility_shares: [share("s1", "bad", "tess", { method: "fixed", amount_cents: 200000 })],
            persons,
        });
        expect(await plan(db)).toMatchObject({ status: "refused", reason: "fixed_exceeds_net" });
    });
});

describe("the run binds through the canonical resolver, at creation, before posting", () => {
    const gen = code("lib/financials/tuitionGeneration/generateTuitionCharges.ts");
    const helper = code("lib/financials/tuitionGeneration/tuitionResponsibility.ts");

    it("generation calls the shared step on the draft BEFORE auto-posting it", () => {
        const bind = gen.indexOf("responsibility = await applyTuitionResponsibility(supabase, {");
        const post = gen.indexOf("await autoPostGeneratedCharge(supabase, {");
        expect(bind).toBeGreaterThan(0);
        expect(post).toBeGreaterThan(bind);
    });

    it("the step IS resolveChargeResponsibility — no tuition-specific allocator, never a reallocation", () => {
        expect(helper).toMatch(/await resolveChargeResponsibility\(supabase, \{[\s\S]*allowReallocation: false,/);
        expect(helper).not.toMatch(/financial_responsibility_allocations/);
        expect(helper).toMatch(/readArrangementInForce\(supabase,/);
        expect(helper).toMatch(/resolveResponsibilitySplit\(\{ netCents: args\.netCents, shares: arrangement\.shares \}\)/);
    });

    it("preview plans responsibility for every row it would bill, and the panel says it", () => {
        expect(code("lib/financials/tuitionGeneration/previewTuitionGeneration.ts")).toMatch(/const responsibility = await planTuitionResponsibility\(supabase, \{/);
        const ui = code("app/adminV2/financials/sections/FinancialsTuitionBilling.tsx");
        expect(ui).toContain("No responsible party — the charge will read Not allocated");
        expect(ui).toContain("Responsibility · {resp.text}");
    });

    it("posting never writes or rewrites an allocation — the debtor is the one bound at creation", () => {
        const writers = ["lib/financials/posting/autoPostGeneratedCharge.ts"];
        for (const rel of writers) expect(read(rel), rel).not.toMatch(/financial_responsibility_allocations/);
        const svc = code("lib/financials/responsibility/responsibilityService.ts");
        expect(svc).toMatch(/if \(net\.status !== "draft" && !args\.allowReallocation\) \{\s*return \{\s*kind: "reallocation_required"/);
        expect(svc).toMatch(/if \(sameAmounts\) return \{ kind: "unchanged"/);
    });
});

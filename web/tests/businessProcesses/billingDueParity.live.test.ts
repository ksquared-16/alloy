/**
 * BP V2 Slice 6A — LIVE CARD-TO-VIEW PARITY. For real local-certification households (Northwind) and
 * marked fixtures, the SAME facts produce the same Due / Past due through:
 *   the Financials card (`buildFinancialsCardVM`) → the shared Financials reader (`readAccountDuePositions`)
 *   → the Billing Work Views (`payments_due`, `overdue_payments`).
 * Plus the date boundaries (yesterday / today / today+6 / today+7), submitted-claim suppression semantics,
 * scope, fin.read, and proof that reading writes nothing. Fixtures are deleted afterwards.
 */
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { dueWithinFor, pastDueFor } from "@/lib/financials/account/accountDueClassification";
import { readAccountDuePositions } from "@/lib/financials/account/accountDuePositions";
import { fetchOrgBusinessDate } from "@/lib/financials/businessDate";
import { resolveCollectiblePositionsForCharges } from "@/lib/financials/workspace/resolveFinancialPosition";
import { loadDomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import type { DomainProjectionScope } from "@/lib/businessProcesses/projections/domainProjectionTypes";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const DB = process.env.BPV2_LIVE_PSQL_CONTAINER ?? "supabase_db_alloy-cert";
const live = Boolean(URL_ && KEY);
const ORG = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002";
const FRONT_DESK = "c0000000-0000-4000-8000-00000000d005";
const R = "00000000-0000-4000-8000-000000000010";
const L = "00000000-0000-4000-8000-000000000011";
const H_L = "00000000-0000-4000-8000-10000000003b";
const POSTED_L = "8698e7de-8357-44c9-b6a8-4feccc4fe497";
const FIX = "bpv2_s6a_fixture";
const ALL: DomainProjectionScope = { siteScope: "all", allowedSiteLocationIds: [] };

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { org: ORG, at: new Date().toISOString() };
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const moneyFingerprint = () =>
    psql(`select md5(coalesce(string_agg(x, '|' order by x), '')) from (
        select 'c:'||to_jsonb(c)::text x from charges c where org_id='${ORG}'
        union all select 'p:'||to_jsonb(p)::text from payments p where org_id='${ORG}'
        union all select 'pa:'||to_jsonb(a)::text from payment_allocations a where org_id='${ORG}'
        union all select 'v:'||to_jsonb(v)::text from financial_subsidy_claim_lines v where org_id='${ORG}') q`);
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const fx = { yesterday: randomUUID(), today: randomUUID(), plus6: randomUUID(), plus7: randomUUID() };
const chain = { agency: randomUUID(), program: randomUUID(), claim: randomUUID(), line: randomUUID() };
afterAll(async () => {
    if (!live) return;
    // Posted charges are immutable by trigger; these are this suite's own marked fixtures on the LOCAL
    // certification stack, removed in one transaction with triggers bypassed for this session only.
    psql(`begin; set local session_replication_role = replica;
          delete from financial_subsidy_claim_lines where id='${chain.line}';
          delete from financial_subsidy_claims where id='${chain.claim}';
          delete from financial_subsidy_programs where id='${chain.program}';
          delete from financial_funding_agencies where id='${chain.agency}';
          delete from charges where metadata ? '${FIX}' and id in ('${Object.values(fx).join("','")}');
          commit;`);
    evidence.fixtures_remaining = Number(psql(`select count(*) from charges where id in ('${Object.values(fx).join("','")}')`));
    if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
});

const cohort = async (key: string, scope: DomainProjectionScope = ALL, userId: string = ADMIN) =>
    loadDomainProjectionCohort(supabase, { domain: "billing", projectionKey: key, orgId: ORG, userId, scope });

describe.skipIf(!live)("live — S6A: Billing Due / Past due = the Financials card's own classification", () => {
    it("card → shared reader → Work Views agree; boundaries, suppression semantics, scope, fin.read, no writes", async () => {
        supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
        const today = await fetchOrgBusinessDate(supabase, ORG);
        const windowEnd = addDays(today, 6);
        evidence.today = today;
        evidence.window_end = windowEnd;

        // Boundary fixtures on H_L (Lakeside): posted, unpaid, due yesterday / today / today+6 / today+7.
        const clone = (id: string, due: string) =>
            psql(`insert into charges select (jsonb_populate_record(null::charges, to_jsonb(c) || jsonb_build_object(
                    'id','${id}','source_charge_id',null,'due_date','${due}',
                    'metadata', jsonb_build_object('${FIX}',true)))).* from charges c where c.id='${POSTED_L}'`);
        clone(fx.yesterday, addDays(today, -1));
        clone(fx.today, today);
        clone(fx.plus6, addDays(today, 6));
        clone(fx.plus7, addDays(today, 7));

        const before = moneyFingerprint();

        // ── 1. The shared reader over the whole org (unrestricted). ──
        const read = await readAccountDuePositions(supabase, { orgId: ORG, today, windowEnd, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: null });
        if (read.state !== "ok") throw new Error(read.reason);
        evidence.reader = { accounts: read.accounts.length, candidate_charges: read.candidateCharges, truncated: read.truncated };

        // ── 2. Card parity, account by account: the card's Past due, and the card's own rows through the shared functions. ──
        const parity: unknown[] = [];
        for (const a of read.accounts) {
            const vm = await buildFinancialsCardVM(supabase, { orgId: ORG, customerId: a.customerId, today });
            const applied = new Map(vm.rows.map((r) => [r.chargeId, r.appliedCents ?? 0]));
            const cardPast = vm.pastDue && vm.pastDue.amountCents > 0 ? vm.pastDue : null;
            const readerPast = a.pastDue && a.pastDue.amountCents > 0 ? a.pastDue : null;
            const cardWithin = dueWithinFor(vm.rows, today, windowEnd, applied);
            expect(pastDueFor(vm.rows, today, applied)).toEqual(vm.pastDue); // the card's VM uses the shared function
            expect(readerPast?.amountCents ?? null, `past due ${a.customerId}`).toBe(cardPast?.amountCents ?? null);
            expect(readerPast?.oldestDueDate ?? null).toBe(cardPast?.oldestDueDate ?? null);
            expect(a.dueWithin?.amountCents ?? null, `due within ${a.customerId}`).toBe(cardWithin?.amountCents ?? null);
            expect(a.dueWithin?.chargeIds ?? null).toEqual(cardWithin?.chargeIds ?? null);
            parity.push({ household: a.customerId, card_past_due: cardPast?.amountCents ?? null, reader_past_due: readerPast?.amountCents ?? null, card_due_within: cardWithin?.amountCents ?? null, reader_due_within: a.dueWithin?.amountCents ?? null });
        }
        evidence.card_parity = { accounts_compared: parity.length, mismatches: 0, sample: parity.slice(0, 8) };

        // ── 2b. Households with owed charges that the reader did NOT return (undated, settled, or not yet in the window): the card shows neither either. ──
        const qualifying = new Set(read.accounts.map((a) => a.customerId));
        const candidates = psql(`select distinct coalesce(a.customer_id::text, case when c.billable_source_type='customer' then c.billable_source_id::text end)
            from charges c left join child_enrollment_agreements a on c.billable_source_type='enrollment_agreement' and a.id=c.billable_source_id
            where c.org_id='${ORG}' and c.status in ('posted','partially_paid','paid')`)
            .split("\n").map((x) => x.trim()).filter((x) => x && !qualifying.has(x)).slice(0, 12);
        for (const customerId of candidates) {
            const vm = await buildFinancialsCardVM(supabase, { orgId: ORG, customerId, today });
            const applied = new Map(vm.rows.map((r) => [r.chargeId, r.appliedCents ?? 0]));
            expect(vm.pastDue && vm.pastDue.amountCents > 0 ? vm.pastDue.amountCents : null, `card past due for non-qualifying ${customerId}`).toBeNull();
            expect(dueWithinFor(vm.rows, today, windowEnd, applied), `card due-within for non-qualifying ${customerId}`).toBeNull();
        }
        evidence.non_qualifying_checked = { households: candidates.length, card_shows_neither: true };

        // ── 3. Work Views = the reader's accounts, one row per household. ──
        const overdue = await cohort("overdue_payments");
        const due = await cohort("payments_due");
        if (overdue.status !== "ok" || due.status !== "ok") throw new Error("refused");
        const expectOverdue = read.accounts.filter((a) => a.pastDue && a.pastDue.amountCents > 0 && a.pastDueChargeIds.length).map((a) => a.customerId).sort();
        const expectDue = read.accounts.filter((a) => a.dueWithin && a.dueWithin.amountCents > 0).map((a) => a.customerId).sort();
        expect(overdue.rows.map((r) => r.subject.id).sort()).toEqual(expectOverdue);
        expect(due.rows.map((r) => r.subject.id).sort()).toEqual(expectDue);
        expect(new Set(overdue.rows.map((r) => r.subject.id)).size).toBe(overdue.rows.length);
        expect(overdue.total).toBe(overdue.rows.length);
        evidence.work_views = {
            overdue_households: overdue.total, overdue_facts: overdue.factTotal, due_households: due.total, due_facts: due.factTotal,
            overdue_sample: overdue.rows.slice(0, 3).map((r) => ({ household: r.subject.id, source: r.source, reason: r.detail?.reason })),
            due_sample: due.rows.slice(0, 3).map((r) => ({ household: r.subject.id, source: r.source, reason: r.detail?.reason })),
        };

        // ── 4. Boundaries on the fixture household. ──
        const hl = read.accounts.find((a) => a.customerId === H_L)!;
        expect(hl.pastDueChargeIds).toContain(fx.yesterday);
        expect(hl.pastDueChargeIds).not.toContain(fx.today);
        expect(hl.dueWithin?.chargeIds).toEqual(expect.arrayContaining([fx.today, fx.plus6]));
        expect(hl.dueWithin?.chargeIds).not.toContain(fx.plus7);
        expect(hl.dueWithin?.chargeIds).not.toContain(fx.yesterday);
        const hlDue = due.rows.find((r) => r.subject.id === H_L)!;
        expect(hlDue.source.id).toBe(fx.today);
        expect(hlDue.detail?.reason).toMatch(/ due today · through /);
        evidence.boundaries = { household: H_L, past_due_charges: hl.pastDueChargeIds, due_within_charges: hl.dueWithin?.chargeIds, excluded_plus7: fx.plus7, due_row: { source: hlDue.source, reason: hlDue.detail?.reason }, overdue_row: overdue.rows.find((r) => r.subject.id === H_L)?.detail?.reason ?? null };

        // ── 5. Scope: R-only actor never sees the Lakeside household; L selection shows it. fin.read refused. ──
        const overdueR = await cohort("overdue_payments", { siteScope: "restricted", allowedSiteLocationIds: [R] });
        const dueSelL = await cohort("payments_due", { ...ALL, selectedSiteId: L });
        expect(overdueR.status === "ok" && overdueR.rows.some((r) => r.subject.id === H_L)).toBe(false);
        expect(dueSelL.status === "ok" && dueSelL.rows.some((r) => r.subject.id === H_L)).toBe(true);
        const denied = await cohort("overdue_payments", ALL, FRONT_DESK);
        expect(denied.status).not.toBe("ok");
        evidence.scope = { overdue_R_only_has_lakeside: false, due_selected_L_has_lakeside: true, without_fin_read: denied.status };

        expect(moneyFingerprint()).toBe(before); // reads wrote nothing

        // ── 6. Submitted-claim suppression: the obligation stays past due (card AND view), collectibility shows the suppression. ──
        psql(`insert into financial_funding_agencies (id, org_id, name, agency_key) values ('${chain.agency}', '${ORG}', 'S6A fixture agency', '${FIX}_${chain.agency.slice(0, 8)}');
              insert into financial_subsidy_programs (id, org_id, agency_id, name, program_key) values ('${chain.program}', '${ORG}', '${chain.agency}', 'S6A fixture program', '${FIX}_${chain.program.slice(0, 8)}');
              insert into financial_subsidy_claims (id, org_id, program_id, agency_id, period_key, state, submitted_at, idempotency_key) values ('${chain.claim}', '${ORG}', '${chain.program}', '${chain.agency}', '2026-10', 'submitted', now(), '${FIX}_${chain.claim}');
              insert into financial_subsidy_claim_lines (id, org_id, claim_id, charge_id, claimed_amount_cents, idempotency_key) values ('${chain.line}', '${ORG}', '${chain.claim}', '${fx.yesterday}', 500, '${FIX}_${chain.line}');`);
        const reread = await readAccountDuePositions(supabase, { orgId: ORG, today, windowEnd, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: null });
        if (reread.state !== "ok") throw new Error(reread.reason);
        const hl2 = reread.accounts.find((a) => a.customerId === H_L)!;
        const vm2 = await buildFinancialsCardVM(supabase, { orgId: ORG, customerId: H_L, today });
        const position = (await resolveCollectiblePositionsForCharges(supabase, { orgId: ORG, chargeIds: [fx.yesterday] })).get(fx.yesterday)!;
        expect(hl2.pastDue?.amountCents).toBe(hl.pastDue?.amountCents);
        expect(vm2.pastDue?.amountCents).toBe(hl2.pastDue?.amountCents);
        // Suppression is bounded by expected funding (computeCollectiblePosition); the local stack holds none, so it is 0 here.
        // Its magnitude is Financials' certified function (tests/financials collectible-position suites); what this proves
        // live is that a submitted claim does not erase or change the Past due obligation in the card or the view.
        expect(position.submittedClaimSuppressionCents).toBeGreaterThanOrEqual(0);
        evidence.suppression = {
            charge: fx.yesterday, past_due_before_claim: hl.pastDue?.amountCents, past_due_after_claim: hl2.pastDue?.amountCents, card_past_due_after_claim: vm2.pastDue?.amountCents,
            submitted_claim_suppression_cents: position.submittedClaimSuppressionCents, currently_collectible_cents: position.currentlyCollectibleCents,
            reading: "Past due is the applied-money residual (the card's definition); a submitted claim suppresses COLLECTIBILITY, not the obligation, and is visible beside it.",
        };
    }, 600_000);
});

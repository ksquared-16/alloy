/**
 * BP V2 Slice 5 — LIVE: the three implemented Billing review projections over real local-certification
 * data (Northwind), checked against INDEPENDENT SQL and against Financials' own readers; scope, fin.read,
 * and proof that reading writes no financial fact. Funding variances use a marked fixture chain (agency →
 * program → submitted claim → claim lines → variances on real posted charges), deleted afterwards.
 */
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadDomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import type { DomainProjectionScope } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import { resolveFinancialWorkQueue } from "@/lib/financials/workspace/resolveFinancialWorkQueue";
import { chargeIndexViewOf } from "@/lib/financials/workspace/chargeIndex";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const DB = process.env.BPV2_LIVE_PSQL_CONTAINER ?? "supabase_db_alloy-cert";
const live = Boolean(URL_ && KEY);
const ORG = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002"; // holds fin.read
const FRONT_DESK = "c0000000-0000-4000-8000-00000000d005"; // no fin.read
const R = "00000000-0000-4000-8000-000000000010";
const L = "00000000-0000-4000-8000-000000000011";
const H_R = "00000000-0000-4000-8000-000050000001";
const H_L = "00000000-0000-4000-8000-10000000003b";
const CHARGES_R = ["e286942c-d12d-40f0-93c3-722b0ca7c5c7", "607b7866-7d58-4bc3-941a-4a47307b3967", "36e5005b-c40c-4567-bbc5-65686cb3506b"];
const CHARGE_L = "8698e7de-8357-44c9-b6a8-4feccc4fe497";
const FIX = "bpv2_s5_fixture";

const ALL: DomainProjectionScope = { siteScope: "all", allowedSiteLocationIds: [] };
const ONLY_R: DomainProjectionScope = { siteScope: "restricted", allowedSiteLocationIds: [R] };

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { org: ORG, at: new Date().toISOString(), views: {} };
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const moneyFingerprint = () =>
    psql(`select md5(coalesce(string_agg(x, '|' order by x), '')) from (
        select 'c:'||to_jsonb(c)::text x from charges c where org_id='${ORG}'
        union all select 'p:'||to_jsonb(p)::text from payments p where org_id='${ORG}'
        union all select 'pa:'||to_jsonb(a)::text from payment_allocations a where org_id='${ORG}'
        union all select 'pca:'||to_jsonb(t)::text from payment_collection_attempts t where org_id='${ORG}'
        union all select 'v:'||to_jsonb(v)::text from financial_subsidy_variances v where org_id='${ORG}') q`);

const run = (key: string, scope: DomainProjectionScope, userId: string = ADMIN) =>
    loadDomainProjectionCohort(supabase, { domain: "billing", projectionKey: key, orgId: ORG, userId, scope });
const households = (c: Awaited<ReturnType<typeof run>>) =>
    c.status === "ok" ? Object.fromEntries(c.rows.map((r) => [r.subject.id, r.source.count])) : null;

const ids = { agency: randomUUID(), program: randomUUID(), claim: randomUUID(), lines: [] as string[], variances: [] as string[] };
afterAll(async () => {
    if (!live) return;
    psql(`delete from financial_subsidy_variances where id in (${ids.variances.map((v) => `'${v}'`).join(",") || "null"});
          delete from financial_subsidy_claim_lines where id in (${ids.lines.map((v) => `'${v}'`).join(",") || "null"});
          delete from financial_subsidy_claims where id='${ids.claim}';
          delete from financial_subsidy_programs where id='${ids.program}';
          delete from financial_funding_agencies where id='${ids.agency}';`);
    evidence.fixtures_remaining = Number(psql(`select (select count(*) from financial_funding_agencies where id='${ids.agency}') + (select count(*) from financial_subsidy_claims where id='${ids.claim}') + (select count(*) from financial_subsidy_variances where idempotency_key like '${FIX}%')`));
    if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
});

describe.skipIf(!live)("live — S5 Billing review projections", () => {
    it("match independent SQL and Financials' readers, honour scope and fin.read, and write nothing", async () => {
        supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
        const views = evidence.views as Record<string, unknown>;

        // Funding-variance fixtures: H_R has an open short-paid (in), a resolved one (out) and an open zero "matched" (out); H_L an open overpaid (in).
        psql(`insert into financial_funding_agencies (id, org_id, name, agency_key) values ('${ids.agency}', '${ORG}', 'S5 fixture agency', '${FIX}_${ids.agency.slice(0, 8)}');
              insert into financial_subsidy_programs (id, org_id, agency_id, name, program_key) values ('${ids.program}', '${ORG}', '${ids.agency}', 'S5 fixture program', '${FIX}_${ids.program.slice(0, 8)}');
              insert into financial_subsidy_claims (id, org_id, program_id, agency_id, period_key, state, submitted_at, idempotency_key) values ('${ids.claim}', '${ORG}', '${ids.program}', '${ids.agency}', '2026-10', 'submitted', now(), '${FIX}_${ids.claim}');`);
        const fixtures: Array<{ charge: string; expected: number; actual: number; variance: number; state: string; resolved: boolean }> = [
            { charge: CHARGES_R[0]!, expected: 1000, actual: 500, variance: -500, state: "short_paid", resolved: false },
            { charge: CHARGES_R[1]!, expected: 1000, actual: 600, variance: -400, state: "short_paid", resolved: true },
            { charge: CHARGES_R[2]!, expected: 1000, actual: 1000, variance: 0, state: "matched", resolved: false },
            { charge: CHARGE_L, expected: 800, actual: 900, variance: 100, state: "overpaid", resolved: false },
        ];
        for (const f of fixtures) {
            const line = randomUUID();
            const variance = randomUUID();
            ids.lines.push(line);
            ids.variances.push(variance);
            psql(`insert into financial_subsidy_claim_lines (id, org_id, claim_id, charge_id, claimed_amount_cents, idempotency_key) values ('${line}', '${ORG}', '${ids.claim}', '${f.charge}', ${f.expected}, '${FIX}_${line}');
                  insert into financial_subsidy_variances (id, org_id, claim_line_id, expected_cents, actual_cents, variance_cents, state, resolution_kind, resolved_at, idempotency_key)
                  values ('${variance}', '${ORG}', '${line}', ${f.expected}, ${f.actual}, ${f.variance}, '${f.state}', ${f.resolved ? "'write_off'" : "null"}, ${f.resolved ? "now()" : "null"}, '${FIX}_${variance}');`);
        }

        const before = moneyFingerprint();

        // ── charges_needing_review: parity with Financials' own work queue + charge index ──
        const queue = await resolveFinancialWorkQueue(supabase, { orgId: ORG, siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: null, limit: 500 });
        const expectedReview: Record<string, number> = {};
        for (const row of queue.rows) if (chargeIndexViewOf(row) === "attention" && row.customerId) expectedReview[row.customerId] = (expectedReview[row.customerId] ?? 0) + 1;
        const review = await run("charges_needing_review", ALL);
        expect(households(review)).toEqual(expectedReview);
        views.charges_needing_review = { households: Object.keys(expectedReview).length, facts: Object.values(expectedReview).reduce((a, b) => a + b, 0), parity_with_financials_reader: true, draft_charges_in_org: Number(psql(`select count(*) from charges where org_id='${ORG}' and status='draft'`)) };

        // ── payment_exceptions: independent SQL ──
        const sqlExceptions = (where: string) => {
            const out: Record<string, number> = {};
            const rows = psql(`select hh, count(*) from (
                  select case when t.billable_source_type='customer' then t.billable_source_id::text else a.customer_id::text end hh,
                         case when t.billable_source_type='customer' then 'org' when a.site_location_id is null then null else a.site_location_id::text end site
                  from payment_collection_attempts t left join child_enrollment_agreements a on t.billable_source_type='enrollment_agreement' and a.id=t.billable_source_id and a.org_id=t.org_id
                  where t.org_id='${ORG}' and t.processor_state='succeeded' and t.canonical_payment_id is null) q
                where hh is not null and site is not null and (${where}) group by hh`);
            for (const line of rows.split("\n").filter(Boolean)) { const [h, n] = line.split("|"); out[h!] = Number(n); }
            return out;
        };
        const exAll = await run("payment_exceptions", ALL);
        const exR = await run("payment_exceptions", ONLY_R);
        const exSelL = await run("payment_exceptions", { ...ALL, selectedSiteId: L });
        expect(households(exAll)).toEqual(sqlExceptions("true"));
        expect(households(exR)).toEqual(sqlExceptions(`site='${R}'`));
        expect(households(exSelL)).toEqual(sqlExceptions(`site='${L}'`));
        const total = Number(psql(`select count(*) from payment_collection_attempts where org_id='${ORG}' and processor_state='succeeded' and canonical_payment_id is null`));
        views.payment_exceptions = {
            unrecognized_collections_in_org: total,
            all: { households: exAll.status === "ok" ? exAll.total : null, facts: exAll.status === "ok" ? exAll.factTotal : null, truncated: exAll.status === "ok" ? exAll.truncated : null },
            restricted_R: { households: exR.status === "ok" ? exR.total : null },
            selected_L: { households: exSelL.status === "ok" ? exSelL.total : null },
            sample: exAll.status === "ok" ? exAll.rows.slice(0, 3).map((r) => ({ household: r.subject.id, source: r.source, reason: r.detail?.reason })) : null,
        };

        // ── funding_variances: independent SQL over the fixtures and any real data ──
        const sqlVariances = (where: string) => {
            const out: Record<string, number> = {};
            const rows = psql(`select hh, count(distinct charge_id) from (
                  select l.charge_id, coalesce(a.customer_id::text, case when c.billable_source_type='customer' then c.billable_source_id::text end) hh,
                         case when c.billable_source_type='customer' then 'org' else a.site_location_id::text end site, sum(v.variance_cents) over (partition by l.charge_id) net
                  from financial_subsidy_variances v join financial_subsidy_claim_lines l on l.id=v.claim_line_id join charges c on c.id=l.charge_id and c.status='posted'
                  left join child_enrollment_agreements a on c.billable_source_type='enrollment_agreement' and a.id=c.billable_source_id
                  where v.org_id='${ORG}' and v.resolution_kind is null) q where net <> 0 and hh is not null and (${where}) group by hh`);
            for (const line of rows.split("\n").filter(Boolean)) { const [h, n] = line.split("|"); out[h!] = Number(n); }
            return out;
        };
        const fvAll = await run("funding_variances", ALL);
        const fvR = await run("funding_variances", ONLY_R);
        const fvSelL = await run("funding_variances", { ...ALL, selectedSiteId: L });
        expect(households(fvAll)).toEqual(sqlVariances("true"));
        expect(households(fvAll)).toEqual({ [H_R]: 1, [H_L]: 1 });
        expect(households(fvR)).toEqual({ [H_R]: 1 });
        expect(households(fvSelL)).toEqual({ [H_L]: 1 });
        views.funding_variances = {
            all: households(fvAll), restricted_R: households(fvR), selected_L: households(fvSelL),
            sample: fvAll.status === "ok" ? fvAll.rows.map((r) => ({ household: r.subject.id, source: r.source, reason: r.detail?.reason })) : null,
            excluded: { resolved: CHARGES_R[1], matched_zero: CHARGES_R[2] },
        };

        // ── fin.read: refused, not zero, for every Billing view ──
        for (const key of ["charges_needing_review", "payment_exceptions", "funding_variances"]) {
            const denied = await run(key, ALL, FRONT_DESK);
            expect(denied.status, key).not.toBe("ok");
            (views[key] as Record<string, unknown>).without_fin_read = denied.status === "ok" ? "ok" : (denied as { code?: string }).code ?? denied.status;
        }

        // ── reading wrote nothing ──
        expect(moneyFingerprint()).toBe(before);
        evidence.money_tables_unchanged_by_reads = true;
    }, 240_000);
});

/**
 * BP V2 Slice 6 — LIVE: a Billing row opens the household with the EXISTING Financials card started on
 * the row's verified source. Real local-certification data (Northwind) plus marked fixtures:
 *   - two DRAFT charges on one household — one Financials classifies `post_failed`, one `review_required`;
 *   - an open subsidy variance on a posted charge (the Slice 5 chain);
 *   - the real unrecognized collections already in the org.
 * Every step is production server code: the Billing cohort, `resolveHouseholdFinancialFocus` (the record
 * route's check) and `financialsLeadStart` (where the card starts). One command is executed through the
 * real command runtime — refused, as it must be for an actor without `fin.write` — and is proven to have
 * written nothing. Fixtures are deleted afterwards.
 */
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadDomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import type { DomainProjectionScope } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import { resolveHouseholdFinancialFocus } from "@/lib/runtime/focus/householdFinancialFocusSource";
import { financialsLeadStart } from "@/components/presentation/durableRecord/DurableRecordFinancialsLead";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import type { ExecuteCommandInvocationRequest } from "@/lib/platform/commands/runtime/commandExecutionTypes";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const DB = process.env.BPV2_LIVE_PSQL_CONTAINER ?? "supabase_db_alloy-cert";
const live = Boolean(URL_ && KEY);
const ORG = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002"; // fin.read
const FRONT_DESK = "c0000000-0000-4000-8000-00000000d005"; // no fin.read, no fin.write
const H_R = "00000000-0000-4000-8000-000050000001";
const POSTED_R = "e286942c-d12d-40f0-93c3-722b0ca7c5c7";
const CHILD_R = "00000000-0000-4000-8000-000070000050"; // the child the drafts are for — the card posts with this entity
const POSTED_L = "8698e7de-8357-44c9-b6a8-4feccc4fe497";
const FIX = "bpv2_s6_fixture";
const ALL: DomainProjectionScope = { siteScope: "all", allowedSiteLocationIds: [] };

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { org: ORG, at: new Date().toISOString(), scenarios: {} };
const record = (k: string, v: unknown) => ((evidence.scenarios as Record<string, unknown>)[k] = v);
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const moneyFingerprint = () =>
    psql(`select md5(coalesce(string_agg(x, '|' order by x), '')) from (
        select 'c:'||to_jsonb(c)::text x from charges c where org_id='${ORG}'
        union all select 'p:'||to_jsonb(p)::text from payments p where org_id='${ORG}'
        union all select 'pa:'||to_jsonb(a)::text from payment_allocations a where org_id='${ORG}'
        union all select 'pca:'||to_jsonb(t)::text from payment_collection_attempts t where org_id='${ORG}'
        union all select 'v:'||to_jsonb(v)::text from financial_subsidy_variances v where org_id='${ORG}'
        union all select 'we:'||to_jsonb(w)::text from workflow_events w where org_id='${ORG}' and w.payload->>'action_key' like 'charge.%') q`);

const drafts = { failed: randomUUID(), review: randomUUID() };
const chain = { agency: randomUUID(), program: randomUUID(), claim: randomUUID(), line: randomUUID(), variance: randomUUID() };
afterAll(async () => {
    if (!live) return;
    psql(`delete from financial_subsidy_variances where id='${chain.variance}';
          delete from financial_subsidy_claim_lines where id='${chain.line}';
          delete from financial_subsidy_claims where id='${chain.claim}';
          delete from financial_subsidy_programs where id='${chain.program}';
          delete from financial_funding_agencies where id='${chain.agency}';
          delete from charges where id in ('${drafts.failed}','${drafts.review}');`);
    evidence.fixtures_remaining = Number(psql(`select (select count(*) from charges where id in ('${drafts.failed}','${drafts.review}')) + (select count(*) from financial_funding_agencies where id='${chain.agency}')`));
    if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
});

const cohort = async (key: string) => {
    const c = await loadDomainProjectionCohort(supabase, { domain: "billing", projectionKey: key, orgId: ORG, userId: ADMIN, scope: ALL });
    if (c.status !== "ok") throw new Error(`${key}: ${JSON.stringify(c)}`);
    return c.rows;
};
const focus = (householdId: string, kind: string, id: string, userId: string = ADMIN) =>
    resolveHouseholdFinancialFocus(supabase, { orgId: ORG, userId, householdId, kind, id });

describe.skipIf(!live)("live — S6: Billing rows open the existing Financials card on their verified source", () => {
    it("targets each source kind, refuses what does not belong, and writes nothing", async () => {
        supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });

        // Two drafts on H_R (cloned from its posted charge, fresh metadata) — Financials' own post gate decides their reason.
        const clone = (id: string, gate: string, serviceDate: string) =>
            psql(`insert into charges select (jsonb_populate_record(null::charges, to_jsonb(c) || jsonb_build_object(
                    'id','${id}','status','draft','posted_at',null,'source_charge_id',null,'service_date','${serviceDate}',
                    'metadata', jsonb_build_object('post_gate','${gate}','${FIX}',true)))).* from charges c where c.id='${POSTED_R}'`);
        clone(drafts.failed, "post_failed", "2026-10-05");
        clone(drafts.review, "review_required", "2026-10-06");
        psql(`insert into financial_funding_agencies (id, org_id, name, agency_key) values ('${chain.agency}', '${ORG}', 'S6 fixture agency', '${FIX}_${chain.agency.slice(0, 8)}');
              insert into financial_subsidy_programs (id, org_id, agency_id, name, program_key) values ('${chain.program}', '${ORG}', '${chain.agency}', 'S6 fixture program', '${FIX}_${chain.program.slice(0, 8)}');
              insert into financial_subsidy_claims (id, org_id, program_id, agency_id, period_key, state, submitted_at, idempotency_key) values ('${chain.claim}', '${ORG}', '${chain.program}', '${chain.agency}', '2026-10', 'submitted', now(), '${FIX}_${chain.claim}');
              insert into financial_subsidy_claim_lines (id, org_id, claim_id, charge_id, claimed_amount_cents, idempotency_key) values ('${chain.line}', '${ORG}', '${chain.claim}', '${POSTED_R}', 1000, '${FIX}_${chain.line}');
              insert into financial_subsidy_variances (id, org_id, claim_line_id, expected_cents, actual_cents, variance_cents, state, idempotency_key) values ('${chain.variance}', '${ORG}', '${chain.line}', 1000, 500, -500, 'short_paid', '${FIX}_${chain.variance}');`);

        const before = moneyFingerprint();

        // 1/4/6/7/10 — Charges Needing Review: the row's source is the OLDEST draft; each draft targets itself.
        const review = (await cohort("charges_needing_review")).find((r) => r.subject.id === H_R)!;
        expect(review.source).toMatchObject({ kind: "charge", id: drafts.failed, count: 2 });
        expect(review.detail?.reason).toBe("1 failed to post · 1 needs review");
        const fFailed = await focus(H_R, "charge", drafts.failed);
        const fReview = await focus(H_R, "charge", drafts.review);
        expect(fFailed).toMatchObject({ status: "ok", kind: "charge", id: drafts.failed, chargeStatus: "draft" });
        expect(fReview).toMatchObject({ status: "ok", kind: "charge", id: drafts.review, chargeStatus: "draft" });
        expect(financialsLeadStart(fFailed).openCharge?.chargeId).toBe(drafts.failed);
        expect(financialsLeadStart(fReview).openCharge?.chargeId).toBe(drafts.review);
        record("charges_needing_review", { household: H_R, source: review.source, reason: review.detail?.reason, failed: fFailed, review_required: fReview, starts: [financialsLeadStart(fFailed), financialsLeadStart(fReview)] });

        // 8 — Payment Exceptions: the unrecorded collection opens the Payment surface, marked; never shown as received.
        const exception = (await cohort("payment_exceptions"))[0]!;
        const fColl = await focus(exception.subject.id, "collection_attempt", exception.source.id);
        expect(fColl).toMatchObject({ status: "ok", kind: "collection_attempt", recognized: false, processorState: "succeeded" });
        expect(financialsLeadStart(fColl)).toMatchObject({ openCollection: { attemptId: exception.source.id }, openCharge: null, status: "collection" });
        record("payment_exceptions", { household: exception.subject.id, source: exception.source, focus: fColl, start: financialsLeadStart(fColl) });

        // 9 — Funding Variances: the CHARGE the variance is on (never a guessed variance id).
        const variance = (await cohort("funding_variances")).find((r) => r.subject.id === H_R)!;
        expect(variance.source).toMatchObject({ kind: "charge", id: POSTED_R });
        const fVar = await focus(H_R, "charge", variance.source.id);
        expect(fVar).toMatchObject({ status: "ok", kind: "charge", chargeStatus: "posted" });
        expect(financialsLeadStart(fVar).openCharge?.chargeId).toBe(POSTED_R);
        record("funding_variances", { household: H_R, source: variance.source, reason: variance.detail?.reason, focus: fVar });

        // 12 — nothing about another household's item, a missing item, or without fin.read.
        const foreign = await focus(H_R, "charge", POSTED_L);
        const foreignColl = await focus(H_R, "collection_attempt", exception.source.id);
        const missing = await focus(H_R, "charge", randomUUID());
        const noRead = await focus(H_R, "charge", drafts.failed, FRONT_DESK);
        expect(foreign).toEqual({ kind: "charge", id: POSTED_L, status: "other_household" });
        expect(exception.subject.id === H_R ? null : foreignColl).toEqual(exception.subject.id === H_R ? null : { kind: "collection_attempt", id: exception.source.id, status: "other_household" });
        expect(missing?.status).toBe("not_found");
        expect(noRead).toEqual({ kind: "charge", id: drafts.failed, status: "forbidden" });
        expect(financialsLeadStart(foreign)).toMatchObject({ openCharge: null, openCollection: null, status: "other_household" });
        expect(financialsLeadStart(noRead)).toMatchObject({ openCharge: null, notice: null, status: "forbidden" });
        record("refusals", { foreign_charge: foreign, foreign_collection: foreignColl, missing: missing?.status, without_fin_read: noRead });

        // 14/17 — an existing Financials command, invoked exactly as the card does (child entity + charge_id), through the real
        // runtime by an actor without fin.write: refused for that reason, nothing written.
        const refused = await executeCommandInvocation({
            request: {
                invocation: {
                    commandKey: "charge.post", origin: "operator", operationalContext: "focus_panel", surface: "focus_panel",
                    workUnitId: null, processKey: null, providedSubject: { entityType: "child", entityId: CHILD_R }, inputValues: { charge_id: drafts.review, charge_label: "S6 fixture" },
                } as ExecuteCommandInvocationRequest["invocation"],
                mode: "execute",
                executionSubject: { entityType: "child", entityId: CHILD_R },
                departmentId: null, workUnitId: null,
            },
            server: { orgId: ORG, userId: FRONT_DESK, actorRole: "front_desk", accessScope: null, supabase },
        });
        expect(refused.ok).toBe(false);
        const refusal = JSON.stringify(refused);
        expect(refusal).toMatch(/fin\.write|permission|not allowed|don't have access/i);
        record("refused_command", { command: "charge.post", actor: "front desk (no fin.write)", ok: refused.ok, status: (refused as { status?: string }).status ?? null, refusal: refusal.slice(0, 400) });

        // Every read above — and the refused command — left money untouched.
        expect(moneyFingerprint()).toBe(before);

        // 11 — stale: the source disappears; the card is NOT pointed at anything else.
        psql(`delete from charges where id='${drafts.review}'`);
        const stale = await focus(H_R, "charge", drafts.review);
        expect(stale?.status).toBe("not_found");
        expect(financialsLeadStart(stale)).toMatchObject({ openCharge: null, openCollection: null, status: "not_found" });
        expect(financialsLeadStart(stale).notice).toMatch(/no longer on this household's account/);
        record("stale", { focus: stale, start: financialsLeadStart(stale) });
        evidence.money_tables_unchanged_by_reads_and_refusal = true;
    }, 240_000);
});

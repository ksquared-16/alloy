/**
 * BP V2 Slice 8A — LIVE: FINANCIAL QUIESCENCE for the bp_v2 shared-QA plan (QUIESCED_RETAINED).
 *
 * The shared QA organization is permanent, so a run's financial records are RETAINED, not deleted. This
 * suite proves, on the local certification stack, the contract written in
 * certification/business-processes-v2/slice8a/FINANCIAL-QUIESCENCE.md:
 *
 *   POSITIVE — a fresh local org stands in for QA Shared. A run's worth of live financial artifacts (two
 *   drafts awaiting a decision, past-due / due-soon / to-be-paid posted charges, an open subsidy variance)
 *   is neutralized ONLY through the product's registered commands (`charge.cancel_draft`,
 *   `charge.reverse`, `payment.record`, `subsidy.resolve_variance`) executed through the command boundary
 *   as the org's QA actor. Afterwards: every census v2 check answers `~ true`, the five Billing Work Views
 *   return nothing, every pre-existing row still exists, posted rows are byte-identical (immutable history
 *   preserved), and drafts are retained as `void`, not deleted.
 *
 *   NEGATIVE — a second fresh org starts clean and accumulates one defect at a time (pool access, a merchant
 *   binding, a usable method, autopay, a provider attempt, the product's own periodic-billing activation, a
 *   draft, an owed charge, an open variance, unapplied money, an unattributable row). Each defect flips its
 *   OWN check to false and no other; an absent org fails `bp_qr_org_exists`.
 *
 * Nothing is deleted and no trigger is bypassed: the orgs are disposable and stay, quiesced or not, exactly
 * as the hosted org will. Env-gated like every BP live suite.
 */
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMembershipWithAccessProfile } from "@/lib/admin/membershipWithProfile";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import { ensurePeriodicBillingSchedule } from "@/lib/financials/periodicBilling/periodicBillingSchedule";
import { fetchOrgBusinessDate } from "@/lib/financials/businessDate";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import type { ExecuteCommandInvocationRequest } from "@/lib/platform/commands/runtime/commandExecutionTypes";
import { loadDomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import type { DomainProjectionScope } from "@/lib/businessProcesses/projections/domainProjectionTypes";

const URL_ = process.env.BPV2_LIVE_SUPABASE_URL;
const KEY = process.env.BPV2_LIVE_SERVICE_KEY;
const DB = process.env.BPV2_LIVE_PSQL_CONTAINER ?? "supabase_db_alloy-cert";
const live = Boolean(URL_ && KEY);

const CENSUS_PATH = resolve(process.cwd(), "../certification/business-processes-v2/slice8a/bp-quiesced-retained-census.v2.sql");
const REGISTERED_QA_SHARED = "4acc9386-c485-486f-aa1f-05d83499d142";
const REGISTERED_ACTOR_EMAIL = "qa-shared-actor@example.com";
const BILLING_VIEWS = ["charges_needing_review", "payment_exceptions", "funding_variances", "payments_due", "overdue_payments"] as const;
const ALL: DomainProjectionScope = { siteScope: "all", allowedSiteLocationIds: [] };
const RUN = randomUUID().replace(/-/g, "").slice(0, 12);

let supabase: SupabaseClient;
const evidence: Record<string, unknown> = { run: RUN, at: new Date().toISOString() };
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|"], { input: sql, encoding: "utf8" }).trim();
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** The census v2, verbatim, pointed at a local org and its actor (the only two literals it names). */
function census(orgId: string, actorEmail: string): Record<string, { kind: string; payload: string; ok: boolean | null }> {
    const sql = readFileSync(CENSUS_PATH, "utf8").replaceAll(REGISTERED_QA_SHARED, orgId).replaceAll(REGISTERED_ACTOR_EMAIL, actorEmail);
    const out: Record<string, { kind: string; payload: string; ok: boolean | null }> = {};
    for (const line of psql(sql).split("\n").filter(Boolean)) {
        const [id, kind, ...rest] = line.split("|");
        const payload = rest.join("|");
        out[id!] = { kind: kind!, payload, ok: kind === "check" ? /~\s*true\s*$/.test(payload) : null };
    }
    return out;
}
const failing = (c: ReturnType<typeof census>) => Object.entries(c).filter(([, v]) => v.ok === false).map(([k]) => k).sort();

async function qaUser(label: string): Promise<{ id: string; email: string }> {
    const email = `qa-bpq-${label}-${RUN}@example.com`;
    const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true, password: randomUUID(), user_metadata: { full_name: `QA Quiescence ${label}` } });
    if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
    return { id: data.user.id, email };
}

/**
 * A disposable local org standing in for QA Shared. Written the way the shared-QA org ensure writes one —
 * the org row, then the audited admin membership (`createMembershipWithAccessProfile`) — with the actor
 * named through a Person link, which satisfies the money-capable invariant on every revision of it.
 */
async function freshOrg(label: string, actorId: string): Promise<string> {
    const orgId = randomUUID();
    psql(`insert into orgs (id, name, slug, status, industry_id)
            select '${orgId}', 'ZZ BP quiescence ${label} ${RUN}', 'zz-bp-quiescence-${label}-${RUN}', 'active', id from industries where key = 'childcare' and is_active;`);
    namedPersonLink(orgId, actorId, `QA Quiescence ${label}`);
    const m = await createMembershipWithAccessProfile(supabase, { userId: actorId, orgId, role: "admin" });
    if (!m.ok) throw new Error(`createOrg ${label} membership: ${m.error}`);
    return orgId;
}

function namedPersonLink(orgId: string, userId: string, fullName: string) {
    const person = randomUUID();
    psql(`insert into persons (id, org_id, full_name, first_name, last_name, person_number)
            values ('${person}', '${orgId}', '${fullName}', 'QA', 'Quiescence', (select coalesce(max(person_number), 0) + 1 from persons where org_id = '${orgId}'));
          insert into user_person_links (org_id, user_id, person_id, status) values ('${orgId}', '${userId}', '${person}', 'active');`);
}

function exec(orgId: string, actorId: string, actionKey: string, entity: { type: string; id: string }, payload: Record<string, unknown>) {
    return executeCommandInvocation({
        request: {
            invocation: {
                commandKey: actionKey, origin: "operator", operationalContext: "focus_panel", surface: "focus_panel",
                workUnitId: null, processKey: null, providedSubject: { entityType: entity.type, entityId: entity.id }, inputValues: payload,
            } as ExecuteCommandInvocationRequest["invocation"],
            mode: "execute",
            executionSubject: { entityType: entity.type, entityId: entity.id },
            departmentId: null, workUnitId: null,
        },
        server: { orgId, userId: actorId, actorRole: "admin", accessScope: { siteScope: "all", departmentScope: "all" } as never, supabase },
    });
}
async function mustExec(...args: Parameters<typeof exec>) {
    const r = await exec(...args);
    const ok = (r as { ok?: boolean }).ok === true;
    if (!ok) throw new Error(`${args[2]} refused: ${JSON.stringify(r).slice(0, 600)}`);
    return r;
}

/** Controlled fixtures — the artifacts a QA run would have left LIVE, written as the run's actor. */
function household(orgId: string, name: string): string {
    const id = randomUUID();
    // The account's own billing calendar (configuration, as Settings writes it): a correction needs a
    // commercial period to land in, and the hosted QA household needs the same.
    psql(`insert into customers (id, org_id, name, metadata) values ('${id}', '${orgId}', '${name}', '{}'::jsonb);
          insert into financial_policies (org_id, scope_type, customer_id, policy_type, label, value, is_active, effective_start)
            values ('${orgId}', 'customer', '${id}', 'billing_calendar', 'QA household account calendar', '{"cadence":"monthly","anchor_on":null}'::jsonb, true, '2020-01-01');`);
    return id;
}
function charge(orgId: string, actorId: string, customerId: string, o: { status: "draft" | "posted"; amount: number; due: string | null; metadata?: Record<string, unknown> }): string {
    const id = randomUUID();
    psql(`insert into charges (id, org_id, charge_type, charge_category, status, currency_code, amount_cents, service_date, due_date, posted_at,
            description, metadata, billable_source_type, billable_source_id, billing_period_generation, legacy_billing_period_key, created_by, posted_by)
          values ('${id}', '${orgId}', 'fee', 'one_time', '${o.status}', 'USD', ${o.amount}, ${o.due ? `'${o.due}'` : "null"}, ${o.due ? `'${o.due}'` : "null"},
            ${o.status === "posted" ? "now()" : "null"}, 'BP quiescence fixture', '${JSON.stringify({ bpv2_s8a_quiescence: RUN, ...(o.metadata ?? {}) })}'::jsonb,
            'customer', '${customerId}', 'legacy', '${(o.due ?? "2026-10-01").slice(0, 7)}', '${actorId}', ${o.status === "posted" ? `'${actorId}'` : "null"});`);
    return id;
}
function openVariance(orgId: string, actorId: string, chargeId: string): string {
    const [agency, program, claim, line, variance] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    psql(`insert into financial_funding_agencies (id, org_id, name, agency_key, created_by) values ('${agency}', '${orgId}', 'Quiescence agency', 'q_${agency.slice(0, 8)}', '${actorId}');
          insert into financial_subsidy_programs (id, org_id, agency_id, name, program_key, created_by) values ('${program}', '${orgId}', '${agency}', 'Quiescence program', 'q_${program.slice(0, 8)}', '${actorId}');
          insert into financial_subsidy_claims (id, org_id, program_id, agency_id, period_key, state, submitted_at, idempotency_key, created_by) values ('${claim}', '${orgId}', '${program}', '${agency}', '2026-10', 'submitted', now(), 'q_${claim}', '${actorId}');
          insert into financial_subsidy_claim_lines (id, org_id, claim_id, charge_id, claimed_amount_cents, idempotency_key, created_by) values ('${line}', '${orgId}', '${claim}', '${chargeId}', 6000, 'q_${line}', '${actorId}');
          insert into financial_subsidy_variances (id, org_id, claim_line_id, expected_cents, actual_cents, variance_cents, state, idempotency_key, created_by) values ('${variance}', '${orgId}', '${line}', 6000, 4000, -2000, 'short_paid', 'q_${variance}', '${actorId}');`);
    return variance;
}
const views = async (orgId: string, userId: string) => {
    const out: Record<string, number | string> = {};
    for (const key of BILLING_VIEWS) {
        const c = await loadDomainProjectionCohort(supabase, { domain: "billing", projectionKey: key, orgId, userId, scope: ALL });
        out[key] = c.status === "ok" ? c.rows.length : `unavailable:${JSON.stringify(c).slice(0, 300)}`;
    }
    return out;
};
/** Every financial row of the org, by id → its full stored value. */
const ledger = (orgId: string) => {
    const rows = psql(`select 'c:'||id||'|'||to_jsonb(c)::text from charges c where org_id='${orgId}'
                       union all select 'p:'||id||'|'||to_jsonb(p)::text from payments p where org_id='${orgId}'
                       union all select 'a:'||id||'|'||to_jsonb(a)::text from payment_allocations a where org_id='${orgId}'
                       union all select 'v:'||id||'|'||to_jsonb(v)::text from financial_subsidy_variances v where org_id='${orgId}'`);
    return new Map(rows.split("\n").filter(Boolean).map((l) => { const i = l.indexOf("|"); return [l.slice(0, i), JSON.parse(l.slice(i + 1)) as Record<string, unknown>]; }));
};

describe.skipIf(!live)("live — S8A: bp_v2 financial quiescence (QUIESCED_RETAINED)", () => {
    it("POSITIVE: product commands neutralize every live artifact; census v2 clean; views empty; history preserved", async () => {
        supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
        const actor = await qaUser("actor");
        const Q = await freshOrg("positive", actor.id);
        const grants = (await resolveActorPermissionGrants(supabase, Q, actor.id)).permissionKeys ?? [];
        evidence.positive = { org: Q, actor: actor.email, actor_fin_grants: grants.filter((g) => g.startsWith("fin.")).sort() };
        expect(grants).toEqual(expect.arrayContaining(["fin.read", "fin.write", "fin.adjust", "fin.subsidy"]));

        const today = await fetchOrgBusinessDate(supabase, Q);
        expect(failing(census(Q, actor.email))).toEqual([]); // a clean org reads clean

        // ── A run's worth of LIVE artifacts ─────────────────────────────────────────────────────────
        const H = household(Q, "Quiescence Household");
        const fx = {
            reviewDraft: charge(Q, actor.id, H, { status: "draft", amount: 2500, due: addDays(today, 10), metadata: { review_required: true, post_gate: "review_required" } }),
            failedPost: charge(Q, actor.id, H, { status: "draft", amount: 3500, due: addDays(today, 10), metadata: { post_gate: "post_failed", post_attempt: { attempts: 1, last_error: "fixture" } } }),
            pastDue: charge(Q, actor.id, H, { status: "posted", amount: 10000, due: addDays(today, -5) }),
            dueSoon: charge(Q, actor.id, H, { status: "posted", amount: 7000, due: addDays(today, 3) }),
            toBePaid: charge(Q, actor.id, H, { status: "posted", amount: 4200, due: addDays(today, -2) }),
            subsidized: charge(Q, actor.id, H, { status: "posted", amount: 6000, due: addDays(today, -20) }),
        };
        const variance = openVariance(Q, actor.id, fx.subsidized);

        const liveCensus = census(Q, actor.email);
        const liveViews = await views(Q, actor.id);
        evidence.positive_live = { census_failing: failing(liveCensus), views: liveViews };
        expect(failing(liveCensus)).toEqual(["bp_qr_fin_no_draft", "bp_qr_fin_no_open_balance", "bp_qr_fin_no_open_variance"]);
        expect(liveViews.charges_needing_review).toBe(1); // one household, two drafts awaiting a decision
        expect(liveViews.overdue_payments).toBe(1);
        expect(liveViews.payments_due).toBe(1);
        expect(liveViews.payment_exceptions).toBe(0); // no provider rail exists in this org — nothing to recognize

        const before = ledger(Q);

        // ── QUIESCE, through the registered commands only ──────────────────────────────────────────
        const acct = { type: "customer", id: H };
        const commands: Array<{ key: string; target: string; result: string }> = [];
        const run = async (key: string, target: string, payload: Record<string, unknown>, entity = acct) => {
            const r = await mustExec(Q, actor.id, key, entity, payload);
            commands.push({ key, target, result: JSON.stringify(r).slice(0, 160) });
        };
        await run("charge.cancel_draft", fx.reviewDraft, { charge_id: fx.reviewDraft, note: `QA run ${RUN} quiesced` });
        await run("charge.cancel_draft", fx.failedPost, { charge_id: fx.failedPost, note: `QA run ${RUN} quiesced` });
        await run("payment.record", fx.toBePaid, { charge_id: fx.toBePaid, amount_cents: 4200, payment_method: "check", received_at: today, reference_number: `qar-${RUN}`, idempotency_key: `qar_${RUN}_paid`, notes: `QA run ${RUN}` });
        await run("subsidy.resolve_variance", variance, { variance_id: variance, resolution: "accept_family_responsibility", note: `QA run ${RUN} quiesced` }, { type: "person", id: randomUUID() });
        await run("charge.reverse", fx.pastDue, { charge_id: fx.pastDue, kind: "reversal", reason: `QA run ${RUN} quiesced` });
        await run("charge.reverse", fx.dueSoon, { charge_id: fx.dueSoon, kind: "reversal", reason: `QA run ${RUN} quiesced` });
        await run("charge.reverse", fx.subsidized, { charge_id: fx.subsidized, kind: "reversal", reason: `QA run ${RUN} quiesced` });
        evidence.positive_commands = commands;

        // ── QUIESCED ────────────────────────────────────────────────────────────────────────────────
        const after = ledger(Q);
        const quiet = census(Q, actor.email);
        const quietViews = await views(Q, actor.id);
        evidence.positive_quiesced = {
            census: Object.fromEntries(Object.entries(quiet).map(([k, v]) => [k, v.kind === "check" ? v.ok : JSON.parse(v.payload)])),
            views: quietViews,
        };
        expect(failing(quiet)).toEqual([]);
        expect(quietViews).toEqual(Object.fromEntries(BILLING_VIEWS.map((k) => [k, 0])));

        // Immutable history preserved: nothing removed; posted rows unchanged byte for byte; drafts retained as void.
        const missing = [...before.keys()].filter((k) => !after.has(k));
        expect(missing).toEqual([]);
        for (const id of [fx.pastDue, fx.dueSoon, fx.toBePaid, fx.subsidized]) {
            const strip = (r: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(r ?? {}).filter(([k]) => k !== "updated_at"));
            expect(strip(after.get(`c:${id}`))).toEqual(strip(before.get(`c:${id}`)));
        }
        expect([fx.reviewDraft, fx.failedPost].map((id) => after.get(`c:${id}`)?.status)).toEqual(["void", "void"]);
        const reversals = [...after.values()].filter((r) => (r.metadata as Record<string, unknown> | undefined)?.correction_kind === "reversal");
        expect(reversals.map((r) => r.source_charge_id).sort()).toEqual([fx.pastDue, fx.dueSoon, fx.subsidized].sort());
        // Attributed: every row this run wrote — fixtures AND the commands' own rows — names the run's actor.
        const actors = new Set([...after.entries()].filter(([k]) => !k.startsWith("a:")).map(([, r]) => String(r.created_by ?? r.posted_by ?? "")));
        expect([...actors]).toEqual([actor.id]);
        evidence.positive_history = { rows_before: before.size, rows_after: after.size, removed: missing.length, reversal_rows: reversals.length };
    }, 180_000);

    it("NEGATIVE: each un-quiesced condition fails its own check, and only its own", async () => {
        supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
        const actor = await qaUser("nactor");
        const pool = await qaUser("npool");
        const N = await freshOrg("negative", actor.id);
        const today = await fetchOrgBusinessDate(supabase, N);
        const steps: Array<{ defect: string; newly_failing: string[] }> = [];
        let prior: string[] = failing(census(N, actor.email));
        expect(prior).toEqual([]);
        const step = (defect: string, expected: string) => {
            const now = failing(census(N, actor.email));
            const added = now.filter((k) => !prior.includes(k));
            steps.push({ defect, newly_failing: added });
            expect({ defect, added }).toEqual({ defect, added: [expected] });
            prior = now;
        };

        // Org identity: a census pointed at an org that does not exist must not read as clean.
        expect(failing(census(randomUUID(), actor.email))).toEqual(["bp_qr_org_exists"]);

        namedPersonLink(N, pool.id, "QA Quiescence pool");
        const m = await createMembershipWithAccessProfile(supabase, { userId: pool.id, orgId: N, role: "ops", audit: { actorUserId: actor.id } as never });
        if (!m.ok) throw new Error(`pool membership: ${m.error}`);
        step("a pool persona still holds a role", "bp_qr_pool_access");

        const H = household(N, "Negative Household");
        const merchant = randomUUID();
        psql(`insert into payment_provider_merchants (id, org_id, processor, provider_account_ref, readiness, is_active) values ('${merchant}', '${N}', 'stripe', 'acct_fixture_${RUN}', 'ready', true);`);
        step("a provider merchant is bound", "bp_qr_fin_no_merchant");

        const method = randomUUID();
        psql(`insert into payment_methods (id, org_id, payer_entity_type, payer_entity_id, customer_id, rail, processor, provider_customer_ref, provider_method_ref, usability_state, verification_state, created_by)
              values ('${method}', '${N}', 'person', '${randomUUID()}', '${H}', 'card', 'stripe', 'cus_fixture', 'pm_fixture_${RUN}', 'usable', 'verified', '${actor.id}');`);
        step("a usable stored payment method", "bp_qr_fin_no_usable_method");

        psql(`insert into payment_autopay_arrangements (org_id, customer_id, payer_entity_type, payer_entity_id, payment_method_id, status, authorized_by, authorized_at, effective_from)
              values ('${N}', '${H}', 'person', '${randomUUID()}', '${method}', 'active', '${actor.id}', now(), '${today}');`);
        step("an active autopay authorization", "bp_qr_fin_no_autopay");

        psql(`insert into payment_collection_attempts (org_id, processor, merchant_id, provider_account_ref, rail, billable_source_type, billable_source_id, currency, requested_amount_cents, intent_key, processor_state, created_by)
              values ('${N}', 'stripe', '${merchant}', 'acct_fixture_${RUN}', 'card', 'customer', '${H}', 'USD', 1000, 'fixture_${RUN}', 'succeeded', '${actor.id}');`);
        step("a provider collection attempt", "bp_qr_fin_no_provider_activity");

        // The product's OWN activation (POST /api/admin/financials/periodic-billing-activation's writer).
        await ensurePeriodicBillingSchedule(supabase, { orgId: N, firstDueAt: new Date(Date.now() + 86_400_000).toISOString(), actorUserId: actor.id });
        step("periodic billing activated (no command deactivates it)", "bp_qr_fin_no_active_schedule");

        charge(N, actor.id, H, { status: "draft", amount: 1000, due: addDays(today, 5) });
        step("a draft left awaiting a decision", "bp_qr_fin_no_draft");

        const owed = charge(N, actor.id, H, { status: "posted", amount: 8000, due: addDays(today, 30) });
        step("a posted charge still owed (due later, not yet in a view)", "bp_qr_fin_no_open_balance");

        // Unapplied money, through the commands: pay the owed charge, then reverse that application.
        await mustExec(N, actor.id, "payment.record", { type: "customer", id: H }, { charge_id: owed, amount_cents: 8000, payment_method: "check", received_at: today, idempotency_key: `qar_${RUN}_unapplied` });
        const allocation = psql(`select id from payment_allocations where org_id='${N}' and charge_id='${owed}' and status='active'`);
        await mustExec(N, actor.id, "payment.reverse_application", { type: "customer", id: H }, { allocation_id: allocation, reason: `QA run ${RUN} negative fixture` });
        step("an inbound payment left unapplied (its application reversed)", "bp_qr_fin_no_unapplied_money");

        openVariance(N, actor.id, owed);
        step("an unresolved subsidy variance", "bp_qr_fin_no_open_variance");

        psql(`insert into charges (org_id, charge_type, status, currency_code, amount_cents, billable_source_type, billable_source_id, billing_period_generation, legacy_billing_period_key, metadata)
              values ('${N}', 'fee', 'void', 'USD', 100, 'customer', '${H}', 'legacy', '2026-10', '{"bpv2_s8a_quiescence":"unattributed"}'::jsonb);`);
        step("a financial row written by no identity (a job, a webhook, a public link)", "bp_qr_fin_attributed");

        evidence.negative = { org: N, steps };
    }, 180_000);

    /*
     * Census v2 corrections. Each defect gets its OWN fresh org, so "fails its own check and no other" is
     * exact. A send is DURABLE EVIDENCE, not a status: a message that went out and then moved on to
     * `delivered` or `bounced` (or was later marked `failed`) still left the building. Persona access is
     * EFFECTIVE access: a removed role that leaves its access profile (and the scope rows hung on it) is
     * residue, because re-granting any role re-activates that scope.
     */
    it("NEGATIVE (v2 corrections): sends past `sent` and access beyond `user_roles` are detected", async () => {
        supabase = createClient(URL_!, KEY!, { auth: { persistSession: false } });
        const actor = await qaUser("cactor");
        const pool = await qaUser("cpool");
        const cases: Array<{ defect: string; org: string; failing: string[] }> = [];
        const isolated = async (defect: string, mutate: (org: string) => void, expected: string[]) => {
            const org = await freshOrg(`c${cases.length}`, actor.id);
            expect(failing(census(org, actor.email))).toEqual([]);
            mutate(org);
            const now = failing(census(org, actor.email));
            cases.push({ defect, org, failing: now });
            expect({ defect, now }).toEqual({ defect, now: expected });
        };
        const message = (org: string, cols: { direction: string; status: string; sent_at?: boolean; delivered_at?: boolean; provider_message_id?: boolean }) => {
            const thread = randomUUID();
            psql(`insert into communication_threads (id, org_id, primary_entity_type, primary_entity_id, channel) values ('${thread}', '${org}', 'customer', '${randomUUID()}', 'email');
                  insert into communication_messages (org_id, thread_id, channel, direction, status, sent_at, delivered_at, provider_message_id)
                  values ('${org}', '${thread}', 'email', '${cols.direction}', '${cols.status}', ${cols.sent_at ? "now() - interval '1 hour'" : "null"},
                          ${cols.delivered_at ? "now()" : "null"}, ${cols.provider_message_id ? `'fixture-${randomUUID()}'` : "null"});`);
        };

        // Controls: an outbound message never sent (queued) and an inbound one are not sends.
        await isolated("controls: queued outbound, received inbound", (org) => {
            message(org, { direction: "outbound", status: "queued" });
            message(org, { direction: "inbound", status: "received", provider_message_id: true });
        }, []);
        await isolated("sent, then transitioned to delivered", (org) => message(org, { direction: "outbound", status: "delivered", sent_at: true, delivered_at: true, provider_message_id: true }), ["bp_qr_zero_sent"]);
        await isolated("sent, then bounced", (org) => message(org, { direction: "outbound", status: "bounced", sent_at: true, provider_message_id: true }), ["bp_qr_zero_sent"]);
        await isolated("sent_at recorded, status later failed", (org) => message(org, { direction: "outbound", status: "failed", sent_at: true }), ["bp_qr_zero_sent"]);
        await isolated("accepted by the provider, no sent_at yet", (org) => message(org, { direction: "outbound", status: "queued", provider_message_id: true }), ["bp_qr_zero_sent"]);

        // Access: the role is gone but the access profile (and its site scope) stayed.
        await isolated("role removed, access profile left behind", (org) => {
            psql(`insert into user_access_profiles (user_id, org_id, department_scope, site_scope) values ('${pool.id}', '${org}', 'all', 'restricted');`);
        }, ["bp_qr_pool_access"]);
        // The provisioning administrator's own role and profile are not residue.
        await isolated("the frozen actor's own role and profile (control)", () => undefined, []);

        evidence.negative_v2_corrections = cases;
        if (process.env.BPV2_LIVE_EVIDENCE) writeFileSync(process.env.BPV2_LIVE_EVIDENCE, JSON.stringify(evidence, null, 2));
    }, 240_000);
});

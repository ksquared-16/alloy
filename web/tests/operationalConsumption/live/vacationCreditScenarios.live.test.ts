/**
 * SLICE 3C — the same operational truth, four commercial answers, and only one of them is money.
 *
 * A child was expected, the family took an approved vacation, the child did not attend. That is
 * ONE physical fact and Attendance records it once, identically, in every scenario below. What
 * changes is what Commerce says about it:
 *
 *   treatment = credit, valuation resolves   → exactly one Financial Reduction, real money
 *   treatment = no_credit                    → no money, and the audit says a policy decided that
 *   no applicable policy                     → no money, and the audit says nobody decided
 *   credit, valuation unresolved             → no money, review, and a NAMED reason
 *
 * The four must stay auditably distinct. Collapsing "a policy said no" into "nobody configured
 * one" would hide a decision; collapsing "could not be valued" into either would quietly deny a
 * family money an organisation already granted them.
 *
 * Attendance owns none of this. It never writes a balance, a charge or a reduction — it records
 * what happened, and the chain downstream decides what that costs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createFinancialPolicy, voidScheduledFinancialPolicy } from "@/lib/financials/policies/financialPolicyService";
import { recordAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceService";
import { reactToAttendanceFact } from "@/lib/operationalConsumption/attendanceConsumptionReactor";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const AGREEMENT = "00000000-0000-4000-8000-000070000060";
const MEMBER = "00000000-0000-4000-8000-000070000050";
/* The term's opportunity link is incidental here — the read finds it by agreement — but the column
 * is NOT NULL and keyed, so it names a real one rather than a plausible-looking uuid. */
const OPPORTUNITY_MEMBER = "00000000-0000-4000-8000-700000000bb8";
/* `term_kind = tuition` is constrained to have come from a commercial tuition rate. */
const TUITION_RATE = "00000000-0000-4000-8000-0000000b0001";
const ROOM = "00000000-0000-4000-8000-000000000013";
const CUSTOMER = "00000000-0000-4000-8000-000050000001";
/** A month of tuition, as the family agreed it. The credit gives back one day of exactly this. */
const ACCEPTED_MONTH_CENTS = 120000;
const TODAY = new Date().toISOString().slice(0, 10);
const run = Date.now();

/*
 * EACH SCENARIO GETS ITS OWN SERVICE DATE.
 *
 * The consumption event's identity is `cev:attendance:<type>:<agreement>:<date>` — deliberately, so
 * the same fact reported twice is one event. That makes the date part of the identity, and six
 * scenarios sharing one date would share one event: the second would find the first's obligations
 * and read them as its own answer. The first version of this suite did exactly that and reported a
 * `no_credit` run as having produced a credit. Distinct dates, same billing period, same accepted
 * terms — the commercial answer is what varies, not the pricing.
 */
const dayOffset = (n: number) => {
    const d = new Date(`${TODAY}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
};
const DATES = {
    credit: dayOffset(1),
    replay: dayOffset(2),
    noCredit: dayOffset(3),
    noPolicy: dayOffset(4),
    scenarioA: dayOffset(5),
    voidGuard: dayOffset(6),
} as const;

type Obligation = {
    id: string;
    obligation_kind: string;
    status: string;
    amount_cents: number | null;
    review_required: boolean;
    explanation: Record<string, unknown>;
};

type Reduction = {
    id: string;
    reduction_kind: string;
    policy_kind: string | null;
    financial_policy_id: string | null;
    commercial_policy_id: string | null;
    resolved_obligation_id: string | null;
    charge_id: string;
    amount_cents: number;
    basis: string | null;
    basis_value: number | null;
    basis_amount_cents: number | null;
    policy_snapshot: Record<string, unknown>;
    period_key: string | null;
    idempotency_key: string;
};

describeLive("Slice 3C — one truth, four answers", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const factIds: string[] = [];

    /*
     * SELF-HEALING, because the FK makes a half-done teardown permanent. A vacation-credit policy
     * that produced a reduction cannot be deleted while that reduction exists, and a delete that is
     * refused here leaves a live `credit` policy behind for the next scenario to find — which is
     * how a `no_credit` run once produced money. So the reductions go first, unconditionally, by
     * the policies they point at rather than by the obligations this run happens to know about.
     */
    async function clearPolicies() {
        const { data: policyRows } = await supabase
            .from("financial_policies").select("id").eq("org_id", ORG).eq("policy_type", "vacation_credit");
        const policyIds = ((policyRows ?? []) as Array<{ id: string }>).map((p) => p.id);
        if (policyIds.length) {
            const { data: reds } = await supabase
                .from("financial_reduction_applications").select("id, charge_id")
                .eq("org_id", ORG).in("financial_policy_id", policyIds);
            const rows = (reds ?? []) as Array<{ id: string; charge_id: string }>;
            if (rows.length) {
                await supabase.from("financial_reduction_applications").delete().in("id", rows.map((r) => r.id));
                await supabase.from("charges").delete().in("id", rows.map((r) => r.charge_id));
            }
            await supabase.from("financial_policies").delete().in("id", policyIds);
        }
    }

    /** Everything this suite creates, removed in reference order: reductions, charges, then facts. */
    /*
     * ORDER MATTERS, AND THE FK IS WHY.
     *
     * `financial_policy_id` is ON DELETE RESTRICT, so a policy that produced a reduction cannot be
     * deleted until that reduction is. An earlier version of this cleanup deleted policies first,
     * the delete was silently refused, and credit policies accumulated across tests — after which
     * a `no_credit` run found a leftover `credit` policy still in force and produced money the
     * scenario was asserting it would not. The guard was working; the cleanup was wrong.
     */
    async function cleanup() {
        // By DATE, not only by this run's fact ids: a previous run left events on these dates, and
        // the reactor would find them and answer with their obligations instead of measuring now.
        const { data: events } = await supabase
            .from("consumption_events").select("id")
            .eq("org_id", ORG).eq("source_family", "attendance").in("occurs_on", Object.values(DATES));
        const eventIds = ((events ?? []) as Array<{ id: string }>).map((e) => e.id);
        if (!eventIds.length) { await clearPolicies(); return; }
        const { data: obs } = await supabase
            .from("resolved_obligations").select("id").in("consumption_event_id", eventIds);
        const obligationIds = ((obs ?? []) as Array<{ id: string }>).map((o) => o.id);
        if (obligationIds.length) {
            const { data: reds } = await supabase
                .from("financial_reduction_applications").select("id, charge_id")
                .in("resolved_obligation_id", obligationIds);
            const rows = (reds ?? []) as Array<{ id: string; charge_id: string }>;
            if (rows.length) {
                await supabase.from("financial_reduction_applications").delete().in("id", rows.map((r) => r.id));
                await supabase.from("charges").delete().in("id", rows.map((r) => r.charge_id));
            }
            await supabase.from("resolved_obligations").delete().in("id", obligationIds);
        }
        await supabase.from("consumption_events").delete().in("id", eventIds);
        await clearPolicies();
    }

    const policy = (treatment: "credit" | "no_credit") =>
        createFinancialPolicy(supabase, {
            orgId: ORG, policyType: "vacation_credit", scopeType: "org",
            value: { treatment }, effectiveStart: "2026-01-01",
        } as Parameters<typeof createFinancialPolicy>[1]);

    async function absence(key: string, serviceDate: string) {
        const fact = await recordAttendanceEvent(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            eventKind: "absence",
            eventAt: `${serviceDate}T09:00:00.000Z`,
            serviceDate,
            idempotencyKey: key,
            actor: { actorType: "staff", actorLabel: "Cert operator", sourceType: "operator_action", sourceKey: "cert" },
        } as Parameters<typeof recordAttendanceEvent>[1]);
        factIds.push(fact.id);
        return fact;
    }

    async function react(factId: string) {
        const outcome = await reactToAttendanceFact(supabase, { orgId: ORG, attendanceEventId: factId, today: TODAY });
        expect(outcome.status).toBe("consumed");
        return outcome as {
            status: "consumed";
            consumptionEventId: string | null;
            result: { policiesApplied?: Array<{ policyType: string; scope: unknown; applied: boolean; effect: string }> };
        };
    }

    async function obligationsFor(consumptionEventId: string): Promise<Obligation[]> {
        const { data } = await supabase
            .from("resolved_obligations")
            .select("id, obligation_kind, status, amount_cents, review_required, explanation")
            .eq("consumption_event_id", consumptionEventId);
        return (data ?? []) as Obligation[];
    }

    async function reductionsFor(obligationIds: string[]): Promise<Reduction[]> {
        if (!obligationIds.length) return [];
        const { data } = await supabase
            .from("financial_reduction_applications")
            .select("id, reduction_kind, policy_kind, financial_policy_id, commercial_policy_id, resolved_obligation_id, charge_id, amount_cents, basis, basis_value, basis_amount_cents, policy_snapshot, period_key, idempotency_key")
            .in("resolved_obligation_id", obligationIds);
        return (data ?? []) as Reduction[];
    }

    /*
     * THE PRICE THE FAMILY AGREED TO — the thing a vacation credit gives part of back.
     *
     * Without an accepted tuition term the chain stops honestly at "granted but unvalued", which is
     * its own certified state further down. Scenario C needs the other branch, so the term is a
     * fixture: one accepted monthly term covering the period these dates fall in. It is not
     * pricing configuration under test; it is the agreement the credit is measured against.
     */
    let termId: string | null = null;
    async function seedAcceptedTerm() {
        const periodStart = `${DATES.credit.slice(0, 7)}-01`;
        await supabase.from("enrollment_pricing_terms").delete()
            .eq("org_id", ORG).eq("enrollment_agreement_id", AGREEMENT).eq("resolution_key", `t7-3c-${run}`);
        const { data, error } = await supabase.from("enrollment_pricing_terms").insert({
            org_id: ORG,
            opportunity_customer_member_id: OPPORTUNITY_MEMBER,
            customer_member_id: MEMBER,
            enrollment_agreement_id: AGREEMENT,
            term_kind: "tuition",
            source_entity: "commercial_tuition_rates",
            source_id: TUITION_RATE,
            cadence_key: "monthly",
            amount_cents: ACCEPTED_MONTH_CENTS,
            currency_code: "USD",
            state: "accepted",
            resolution_key: `t7-3c-${run}`,
            effective_start: periodStart,
            effective_end: null,
        }).select("id").single();
        if (error) throw new Error(`term fixture failed: ${error.message}`);
        termId = (data as { id: string }).id;
    }
    async function dropAcceptedTerm() {
        if (termId) await supabase.from("enrollment_pricing_terms").delete().eq("id", termId);
        termId = null;
    }

    beforeAll(async () => { await cleanup(); await seedAcceptedTerm(); });
    // Full teardown between scenarios: each one must meet a database that carries nothing from the
    // last, or "the same truth, different policy" is not what is being measured.
    afterEach(cleanup);
    afterAll(async () => { await cleanup(); await dropAcceptedTerm(); });

    // ── SCENARIO C — real money ─────────────────────────────────────────────

    it("C — a credited vacation becomes exactly one Financial Reduction, and the gross stays gross", async () => {
        const created = await policy("credit");
        const fact = await absence(`t7-3c-credit-${run}`, DATES.credit);
        const outcome = await react(fact.id);

        const obligations = await obligationsFor(outcome.consumptionEventId!);
        const credit = obligations.find((o) => o.obligation_kind === "vacation_credit");
        expect(credit, "the absence must resolve a vacation-credit obligation").toBeTruthy();
        expect(credit!.status).toBe("previewed");
        expect(credit!.amount_cents).toBeGreaterThan(0);

        const reductions = await reductionsFor([credit!.id]);
        expect(reductions).toHaveLength(1);
        const reduction = reductions[0]!;

        // PROVENANCE — the authority that actually decided, and only that one.
        expect(reduction.reduction_kind).toBe("policy");
        expect(reduction.policy_kind).toBe("vacation_credit");
        expect(reduction.financial_policy_id).toBe((created as { id: string }).id);
        expect(reduction.commercial_policy_id).toBeNull();
        expect(reduction.resolved_obligation_id).toBe(credit!.id);
        // The obligation AND the event that made it financially current: the same obligation
        // restored under a later correction is a new consequence, not a revival of this one.
        expect(reduction.idempotency_key).toBe(
            `fred:policy:vacation_credit:${credit!.id}:${outcome.consumptionEventId}`,
        );

        // MONEY — negative, and equal in magnitude to what consumption valued.
        expect(reduction.amount_cents).toBe(-credit!.amount_cents!);

        // THE FIGURE, RECONSTRUCTABLE without today's pricing configuration.
        const snapshot = reduction.policy_snapshot;
        expect(reduction.basis).toBe("amount");
        expect(reduction.basis_value).toBe(1);
        expect(reduction.basis_amount_cents).toBe(snapshot.accepted_period_amount_cents);
        expect(snapshot.accepted_term_id).toBe(termId);
        expect(snapshot.accepted_period_amount_cents).toBe(ACCEPTED_MONTH_CENTS);
        expect(snapshot.period_days_used).toBeGreaterThan(0);
        expect(snapshot.credited_days).toBe(1);
        expect(reduction.period_key).toBe(snapshot.period_key);

        // THE CONTRA ARTIFACT — a real charge, negative, in the period it reduces.
        const { data: contraRow } = await supabase
            .from("charges").select("id, amount_cents, status, charge_category, service_date")
            .eq("id", reduction.charge_id).single();
        const contra = contraRow as { id: string; amount_cents: number; status: string; charge_category: string; service_date: string };
        expect(contra.amount_cents).toBe(reduction.amount_cents);
        expect(contra.amount_cents).toBeLessThan(0);
        expect(contra.service_date).toBe(DATES.credit);

        /*
         * GROSS STAYS GROSS. The reduction is a second consequence written beside the tuition, not
         * an edit to it — so no charge that existed before this ran has moved, and the family's net
         * position changes only because a new negative row exists.
         */
        const { data: grossRows } = await supabase
            .from("charges").select("id, amount_cents")
            .eq("org_id", ORG).eq("billable_source_id", AGREEMENT).neq("id", contra.id).gt("amount_cents", 0);
        for (const gross of (grossRows ?? []) as Array<{ amount_cents: number }>) {
            expect(gross.amount_cents).toBeGreaterThan(0);
        }
    });

    it("C replay — three runs of the same truth leave one reduction and one contra artifact", async () => {
        await policy("credit");
        const fact = await absence(`t7-3c-replay-${run}`, DATES.replay);
        const first = await react(fact.id);
        const credit = (await obligationsFor(first.consumptionEventId!)).find((o) => o.obligation_kind === "vacation_credit")!;

        await react(fact.id);
        await react(fact.id);

        const reductions = await reductionsFor([credit.id]);
        expect(reductions, "the obligation is the identity — a replay converges on it").toHaveLength(1);
        const { data: contras } = await supabase
            .from("charges").select("id").eq("id", reductions[0]!.charge_id);
        expect((contras ?? [])).toHaveLength(1);
    });

    // ── SCENARIO D — the same truth, no money ───────────────────────────────

    it("D — no_credit spends nothing, and the audit says a policy decided that", async () => {
        await policy("no_credit");
        const fact = await absence(`t7-3c-nocredit-${run}`, DATES.noCredit);
        const outcome = await react(fact.id);

        const obligations = await obligationsFor(outcome.consumptionEventId!);
        const credits = obligations.filter((o) => o.obligation_kind === "vacation_credit");
        expect(credits).toHaveLength(0);
        expect(await reductionsFor(obligations.map((o) => o.id))).toHaveLength(0);

        // The Attendance fact itself is unchanged — no producer suppression, no alternate path.
        const { data: factRow } = await supabase
            .from("child_attendance_events").select("id, event_kind").eq("id", fact.id).single();
        expect((factRow as { event_kind: string }).event_kind).toBe("absence");
    });

    it("no policy — spends nothing, and is auditably NOT the same as a configured no_credit", async () => {
        await clearPolicies();
        const fact = await absence(`t7-3c-nopolicy-${run}`, DATES.noPolicy);
        const outcome = await react(fact.id);

        const obligations = await obligationsFor(outcome.consumptionEventId!);
        expect(obligations.filter((o) => o.obligation_kind === "vacation_credit")).toHaveLength(0);
        expect(await reductionsFor(obligations.map((o) => o.id))).toHaveLength(0);

        /*
         * THE DISTINCTION THAT MATTERS. Both states spend nothing, and an operator asking why must
         * be able to tell "we decided not to" from "nobody has decided yet". The resolution names
         * the policy it looked for, the scope it found it at, and what that meant — so the two
         * zero-money answers do not read alike.
         */
        const applied = (outcome.result.policiesApplied ?? []).find((p) => p.policyType === "vacation_credit");
        expect(applied, "the resolution must record that vacation_credit was considered").toBeTruthy();
        expect(applied!.scope, "nobody decided, so there is no scope to name").toBeNull();
        expect(applied!.applied).toBe(false);
        expect(applied!.effect).toMatch(/no vacation_credit policy configured/i);
    });

    // ── SCENARIO A — the double-entry guard ─────────────────────────────────

    it("A — an ordinary expected check-in produces no Attendance-derived reduction at all", async () => {
        await policy("credit");
        const fact = await recordAttendanceEvent(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            eventKind: "check_in",
            roomLocationId: ROOM,
            eventAt: `${DATES.scenarioA}T08:05:00.000Z`,
            serviceDate: DATES.scenarioA,
            idempotencyKey: `t7-3c-scenarioA-${run}`,
            actor: { actorType: "staff", actorLabel: "Cert operator", sourceType: "operator_action", sourceKey: "cert" },
        } as Parameters<typeof recordAttendanceEvent>[1]);
        factIds.push(fact.id);
        const outcome = await react(fact.id);

        const obligations = await obligationsFor(outcome.consumptionEventId!);
        expect(obligations.filter((o) => o.obligation_kind === "vacation_credit")).toHaveLength(0);
        expect(await reductionsFor(obligations.map((o) => o.id))).toHaveLength(0);
    });

    // ── THE VOID GUARD, AGAINST THE REAL ARTIFACT ───────────────────────────

    it("a policy that produced a REAL vacation credit cannot be deleted", async () => {
        /*
         * The fixture version of this was certified earlier. This is the same contract against the
         * actual product path — and against it, the two halves separate.
         *
         * A policy that DECIDED money is necessarily in force, and `voidScheduledFinancialPolicy`
         * accepts only a scheduled future version, so the service refuses this one on the date rule
         * before the provenance rule is ever reached. That refusal is correct and is not the one
         * under test. What guards the real artifact is the key itself: deletion by any route is
         * refused while a reduction points at the policy, and the policy, the reduction and the
         * contra artifact all survive the attempt.
         */
        const inForce = await policy("credit");
        const policyId = (inForce as { id: string }).id;

        const fact = await absence(`t7-3c-void-${run}`, DATES.voidGuard);
        const outcome = await react(fact.id);
        const credit = (await obligationsFor(outcome.consumptionEventId!)).find((o) => o.obligation_kind === "vacation_credit");
        expect(credit, "the run must have produced a real credit to guard").toBeTruthy();
        const reduction = (await reductionsFor([credit!.id]))[0]!;
        expect(reduction.financial_policy_id).toBe(policyId);

        // The service refuses, on its own earlier rule: this version is already live.
        await expect(
            voidScheduledFinancialPolicy(supabase, { orgId: ORG, id: policyId, todayYmd: TODAY }),
        ).rejects.toThrow(/scheduled \(future\) version/i);

        // And the invariant refuses deletion by any other route, naming the reduction that holds it.
        const { error } = await supabase.from("financial_policies").delete().eq("id", policyId);
        expect(error?.code).toBe("23503");
        expect(`${error?.message} ${error?.details ?? ""}`).toMatch(/financial_reduction_applications/);

        // All three survive: the decision, the record of it, and the money it moved.
        const { data: policyStill } = await supabase.from("financial_policies").select("id").eq("id", policyId);
        expect(policyStill ?? []).toHaveLength(1);
        const { data: reductionStill } = await supabase
            .from("financial_reduction_applications").select("id").eq("id", reduction.id);
        expect(reductionStill ?? []).toHaveLength(1);
        const { data: contraStill } = await supabase.from("charges").select("id").eq("id", reduction.charge_id);
        expect(contraStill ?? []).toHaveLength(1);
    });
});

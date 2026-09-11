/**
 * SLICE 4A — what happens to money already decided when the truth underneath it is corrected.
 *
 * Scenario C ends with a real financial consequence: a family was credited for a vacation day.
 * Slice 4 asks the only question that matters afterwards — when Attendance says the child actually
 * attended that day, does the credit follow the correction, or does it stay?
 *
 * These cases are written to MEASURE, not to assert a hoped-for design. Where the platform already
 * converges, they lock it. Where it does not, they say so precisely enough to name the gap.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createFinancialPolicy } from "@/lib/financials/policies/financialPolicyService";
import { postChildcareCharge } from "@/lib/financials/childcareChargeService";
import { correctAttendanceEvent, recordAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceService";
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
const OPPORTUNITY_MEMBER = "00000000-0000-4000-8000-700000000bb8";
const TUITION_RATE = "00000000-0000-4000-8000-0000000b0001";
const ROOM = "00000000-0000-4000-8000-000000000013";
const ACCEPTED_MONTH_CENTS = 120000;
const TODAY = new Date().toISOString().slice(0, 10);
const run = Date.now();

const dayOffset = (n: number) => {
    const d = new Date(`${TODAY}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
};
/** Distinct dates: the consumption event's identity includes the date, so scenarios must not share one. */
const DATES = {
    draftCorrection: dayOffset(10),
    replay: dayOffset(11),
    chain: dayOffset(12),
    posted: dayOffset(13),
    reverse: dayOffset(14),
    chainGap: dayOffset(15),
} as const;

type Obligation = { id: string; obligation_kind: string; status: string; amount_cents: number | null; superseded_by_event_id: string | null };
type Reduction = { id: string; charge_id: string; amount_cents: number; resolved_obligation_id: string | null };

describeLive("Slice 4A — a credit meets a correction", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let termId: string | null = null;

    async function clearPolicies() {
        const { data: policyRows } = await supabase
            .from("financial_policies").select("id").eq("org_id", ORG).eq("policy_type", "vacation_credit");
        const policyIds = ((policyRows ?? []) as Array<{ id: string }>).map((p) => p.id);
        if (!policyIds.length) return;
        const { data: reds } = await supabase
            .from("financial_reduction_applications").select("id, charge_id")
            .eq("org_id", ORG).in("financial_policy_id", policyIds);
        const rows = (reds ?? []) as Array<{ id: string; charge_id: string }>;
        if (rows.length) {
            const contraIds = rows.map((r) => r.charge_id);
            await supabase.from("charges").delete().eq("org_id", ORG).in("source_charge_id", contraIds);
            await supabase.from("financial_reduction_applications").delete().in("id", rows.map((r) => r.id));
            await supabase.from("charges").delete().in("id", contraIds);
        }
        await supabase.from("financial_policies").delete().in("id", policyIds);
    }

    async function cleanup() {
        const { data: events } = await supabase
            .from("consumption_events").select("id")
            .eq("org_id", ORG).eq("source_family", "attendance").in("occurs_on", Object.values(DATES));
        const eventIds = ((events ?? []) as Array<{ id: string }>).map((e) => e.id);
        if (eventIds.length) {
            const { data: obs } = await supabase.from("resolved_obligations").select("id").in("consumption_event_id", eventIds);
            const obligationIds = ((obs ?? []) as Array<{ id: string }>).map((o) => o.id);
            if (obligationIds.length) {
                const { data: reds } = await supabase
                    .from("financial_reduction_applications").select("id, charge_id").in("resolved_obligation_id", obligationIds);
                const rows = (reds ?? []) as Array<{ id: string; charge_id: string }>;
                if (rows.length) {
                    const contraIds = rows.map((r) => r.charge_id);
                    // Compensating charges point at the contra ones, so they go first.
                    await supabase.from("charges").delete().eq("org_id", ORG).in("source_charge_id", contraIds);
                    await supabase.from("financial_reduction_applications").delete().in("id", rows.map((r) => r.id));
                    await supabase.from("charges").delete().in("id", contraIds);
                }
                await supabase.from("resolved_obligations").delete().in("id", obligationIds);
            }
            await supabase.from("consumption_events").delete().in("id", eventIds);
        }
        await clearPolicies();
    }

    async function seedTerm() {
        const { data, error } = await supabase.from("enrollment_pricing_terms").insert({
            org_id: ORG, opportunity_customer_member_id: OPPORTUNITY_MEMBER, customer_member_id: MEMBER,
            enrollment_agreement_id: AGREEMENT, term_kind: "tuition", source_entity: "commercial_tuition_rates",
            source_id: TUITION_RATE, cadence_key: "monthly", amount_cents: ACCEPTED_MONTH_CENTS,
            currency_code: "USD", state: "accepted", resolution_key: `t7-4a-${run}`,
            effective_start: `${DATES.chain.slice(0, 7)}-01`, effective_end: null,
        }).select("id").single();
        if (error) throw new Error(`term fixture failed: ${error.message}`);
        termId = (data as { id: string }).id;
    }

    const creditPolicy = () =>
        createFinancialPolicy(supabase, {
            orgId: ORG, policyType: "vacation_credit", scopeType: "org",
            value: { treatment: "credit" }, effectiveStart: "2026-01-01",
        } as Parameters<typeof createFinancialPolicy>[1]);

    async function absence(key: string, serviceDate: string) {
        return recordAttendanceEvent(supabase, {
            orgId: ORG, enrollmentAgreementId: AGREEMENT, eventKind: "absence",
            eventAt: `${serviceDate}T09:00:00.000Z`, serviceDate, idempotencyKey: key,
            actor: { actorType: "staff", actorLabel: "Cert operator", sourceType: "operator_action", sourceKey: "cert" },
        } as Parameters<typeof recordAttendanceEvent>[1]);
    }

    /** The correction that says the child was here after all. */
    async function correctToAttended(targetId: string, key: string, serviceDate: string) {
        return correctAttendanceEvent(supabase, {
            orgId: ORG, correctsEventId: targetId, entryType: "correction",
            eventKind: "check_in", roomLocationId: ROOM,
            eventAt: `${serviceDate}T08:10:00.000Z`, serviceDate, idempotencyKey: key,
            actor: { actorType: "staff", actorLabel: "Cert operator", sourceType: "operator_action", sourceKey: "cert" },
        } as Parameters<typeof correctAttendanceEvent>[1]);
    }

    /** The second correction: the attendance was itself wrong; the child was away after all. */
    async function correctToAbsent(targetId: string, key: string, serviceDate: string) {
        return correctAttendanceEvent(supabase, {
            orgId: ORG, correctsEventId: targetId, entryType: "correction",
            eventKind: "absence",
            eventAt: `${serviceDate}T09:00:00.000Z`, serviceDate, idempotencyKey: key,
            actor: { actorType: "staff", actorLabel: "Cert operator", sourceType: "operator_action", sourceKey: "cert" },
        } as Parameters<typeof correctAttendanceEvent>[1]);
    }

    async function react(factId: string) {
        const outcome = await reactToAttendanceFact(supabase, { orgId: ORG, attendanceEventId: factId, today: TODAY });
        expect(outcome.status).toBe("consumed");
        return outcome as { status: "consumed"; consumptionEventId: string | null; result: Record<string, unknown> };
    }

    async function obligationsOn(serviceDate: string): Promise<Obligation[]> {
        const { data: events } = await supabase
            .from("consumption_events").select("id")
            .eq("org_id", ORG).eq("source_family", "attendance").eq("occurs_on", serviceDate);
        const ids = ((events ?? []) as Array<{ id: string }>).map((e) => e.id);
        if (!ids.length) return [];
        const { data } = await supabase
            .from("resolved_obligations")
            .select("id, obligation_kind, status, amount_cents, superseded_by_event_id")
            .in("consumption_event_id", ids);
        return (data ?? []) as Obligation[];
    }

    async function reductionsFor(obligationIds: string[]): Promise<Reduction[]> {
        if (!obligationIds.length) return [];
        const { data } = await supabase
            .from("financial_reduction_applications")
            .select("id, charge_id, amount_cents, resolved_obligation_id")
            .in("resolved_obligation_id", obligationIds);
        return (data ?? []) as Reduction[];
    }

    async function chargeRow(chargeId: string) {
        const { data } = await supabase
            .from("charges").select("id, status, amount_cents, posted_at, source_charge_id").eq("id", chargeId).maybeSingle();
        return data as { id: string; status: string; amount_cents: number; posted_at: string | null; source_charge_id: string | null } | null;
    }

    async function chargeStatus(chargeId: string): Promise<string | null> {
        const { data } = await supabase.from("charges").select("status").eq("id", chargeId).maybeSingle();
        return (data as { status: string } | null)?.status ?? null;
    }

    beforeAll(async () => { await cleanup(); await seedTerm(); });
    afterEach(cleanup);
    afterAll(async () => {
        await cleanup();
        if (termId) await supabase.from("enrollment_pricing_terms").delete().eq("id", termId);
    });

    // ── G / F1 — a draft credit meets a correction saying the child attended ──

    it("G — a correction that says the child attended must not leave an active vacation credit", async () => {
        await creditPolicy();
        const original = await absence(`t7-4a-g-${run}`, DATES.draftCorrection);
        const before = await react(original.id);

        const creditBefore = (await obligationsOn(DATES.draftCorrection)).find((o) => o.obligation_kind === "vacation_credit");
        expect(creditBefore, "the vacation must first produce a credit to correct").toBeTruthy();
        const reductionBefore = (await reductionsFor([creditBefore!.id]))[0];
        expect(reductionBefore, "the credit must first be real money").toBeTruthy();
        expect(await chargeStatus(reductionBefore!.charge_id)).toBe("draft");

        // THE CORRECTION. Same day, same child: the child was here after all.
        const correction = await correctToAttended(original.id, `t7-4a-g-corr-${run}`, DATES.draftCorrection);
        await react(correction.id);

        /*
         * WHAT MUST BE TRUE AFTERWARDS. Attendance now says attended. A vacation credit and an
         * attendance on the same day cannot both be current: the family would be credited for a day
         * their child was in care. So no ACTIVE reduction may remain against the corrected day.
         */
        const after = await obligationsOn(DATES.draftCorrection);
        const liveCredits = after.filter((o) => o.obligation_kind === "vacation_credit" && !o.superseded_by_event_id);
        const liveReductions = await reductionsFor(after.map((o) => o.id));
        const liveContra = await Promise.all(liveReductions.map((r) => chargeStatus(r.charge_id)));

        // The obligation must be superseded — the operational layer's own job.
        expect(liveCredits, "the corrected truth leaves no live vacation obligation").toHaveLength(0);
        /*
         * AND THE MONEY MUST FOLLOW IT. This is the assertion that matters, and the weaker version
         * of it — "no live obligation OR no live charge" — passed while the credit was still owed.
         * A superseded obligation with a live draft contra charge IS an attended child keeping a
         * vacation credit; the obligation being tidy is no comfort to the family's balance.
         */
        expect(
            liveContra.every((st) => st !== "draft" && st !== "posted"),
            `the corrected day still carries live contra charges ${JSON.stringify(liveContra)} — `
            + "an attended child would keep a vacation credit",
        ).toBe(true);
        // The record of the decision survives; only the money is withdrawn.
        expect(liveReductions.length, "the application row remains as provenance").toBeGreaterThan(0);

        expect(before.consumptionEventId).toBeTruthy();

        // The trace Slice 4 asks for, printed so the report can carry real ids.
        // eslint-disable-next-line no-console
        console.log("SLICE4-G", JSON.stringify({
            attendanceFact: original.id,
            correctionFact: correction.id,
            consumptionEventBefore: before.consumptionEventId,
            obligationBefore: creditBefore!.id,
            reductionBefore: reductionBefore!.id,
            contraBefore: reductionBefore!.charge_id,
            contraStatusAfter: await chargeStatus(reductionBefore!.charge_id),
            obligationsAfter: after.map((o) => ({ id: o.id, kind: o.obligation_kind, status: o.status, superseded: o.superseded_by_event_id })),
            reductionsAfter: liveReductions.map((r) => ({ id: r.id, obligation: r.resolved_obligation_id, amount: r.amount_cents })),
            contraStatusesAfter: liveContra,
        }, null, 1));
    });

    // ── I — replay after correction ─────────────────────────────────────────

    it("I — replaying the correction does not multiply anything", async () => {
        await creditPolicy();
        const original = await absence(`t7-4a-i-${run}`, DATES.replay);
        await react(original.id);
        const correction = await correctToAttended(original.id, `t7-4a-i-corr-${run}`, DATES.replay);

        await react(correction.id);
        const afterOnce = await obligationsOn(DATES.replay);
        const reductionsOnce = await reductionsFor(afterOnce.map((o) => o.id));

        await react(correction.id);
        await react(correction.id);

        const afterThrice = await obligationsOn(DATES.replay);
        const reductionsThrice = await reductionsFor(afterThrice.map((o) => o.id));
        expect(afterThrice.length, "obligations must not grow with replay").toBe(afterOnce.length);
        expect(reductionsThrice.length, "reductions must not grow with replay").toBe(reductionsOnce.length);

        const chargeIds = new Set(reductionsThrice.map((r) => r.charge_id));
        expect(chargeIds.size, "one contra artifact per reduction, however many times it is delivered")
            .toBe(reductionsThrice.length);
    });

    // ── H — the same correction, after the money has been POSTED ────────────

    it("H — a posted vacation credit survives the correction, and the compensation is measured not assumed", async () => {
        await creditPolicy();
        const original = await absence(`t7-4b-h-${run}`, DATES.posted);
        await react(original.id);

        const credit = (await obligationsOn(DATES.posted)).find((o) => o.obligation_kind === "vacation_credit");
        expect(credit, "the vacation must first produce a credit").toBeTruthy();
        const reduction = (await reductionsFor([credit!.id]))[0]!;

        /*
         * POSTED FOR REAL, through the canonical owner — not a fixture setting a status column.
         * `postChildcareCharge` is what production uses, and it records the journal consequence
         * that makes the money history rather than an intention.
         */
        const posting = await postChildcareCharge(supabase, { orgId: ORG, chargeId: reduction.charge_id, actorUserId: null });
        expect(posting.charge.status).toBe("posted");
        expect(posting.journal, "posting must record its journal consequence").toBeTruthy();
        const postedBefore = await chargeRow(reduction.charge_id);
        expect(postedBefore!.status).toBe("posted");

        // THE CORRECTION: the child attended after all.
        const correction = await correctToAttended(original.id, `t7-4b-h-corr-${run}`, DATES.posted);
        await react(correction.id);

        const postedAfter = await chargeRow(reduction.charge_id);
        const obligationsAfter = await obligationsOn(DATES.posted);
        const reductionsAfter = await reductionsFor(obligationsAfter.map((o) => o.id));
        // Anything the platform appended against the posted contra charge.
        const { data: compRows } = await supabase
            .from("charges").select("id, amount_cents, status, source_charge_id")
            .eq("org_id", ORG).eq("source_charge_id", reduction.charge_id);
        const compensating = (compRows ?? []) as Array<{ id: string; amount_cents: number; status: string }>;

        // eslint-disable-next-line no-console
        console.log("SLICE4-H", JSON.stringify({
            attendanceFact: original.id,
            correctionFact: correction.id,
            obligation: credit!.id,
            reduction: reduction.id,
            contra: reduction.charge_id,
            postedAmount: postedBefore!.amount_cents,
            statusAfterCorrection: postedAfter!.status,
            amountAfterCorrection: postedAfter!.amount_cents,
            postedAtUnchanged: postedBefore!.posted_at === postedAfter!.posted_at,
            obligationsAfter: obligationsAfter.map((o) => ({ id: o.id, kind: o.obligation_kind, status: o.status })),
            reductionsAfter: reductionsAfter.map((r) => ({ id: r.id, amount: r.amount_cents })),
            compensatingCharges: compensating,
        }, null, 1));

        /*
         * HISTORY IS IMMUTABLE — the half of the law that must hold whatever else does. The posted
         * contra charge keeps its status, its amount and its posting timestamp, and the application
         * row keeps the provenance that explains it.
         */
        expect(postedAfter!.status).toBe("posted");
        expect(postedAfter!.amount_cents).toBe(postedBefore!.amount_cents);
        expect(postedAfter!.posted_at).toBe(postedBefore!.posted_at);
        expect(reductionsAfter.some((r) => r.id === reduction.id), "the original application remains").toBe(true);

        /*
         * AND THE MONEY IS ANSWERED. Exactly one compensating artifact, equal and opposite, pointing
         * back at what it answers. Posted money is not deleted and not edited — it is replied to.
         */
        expect(compensating, "posted money must be answered, not merely protected").toHaveLength(1);
        expect(compensating[0]!.amount_cents).toBe(-postedBefore!.amount_cents);
        expect(compensating[0]!.status).toBe("posted");

        // Net position restored: the credit and its reversal cancel.
        expect(postedAfter!.amount_cents + compensating[0]!.amount_cents).toBe(0);

        // ── POSTED REPLAY — the answer is given once, however often the correction arrives ──
        await react(correction.id);
        await react(correction.id);
        const { data: afterReplay } = await supabase
            .from("charges").select("id, amount_cents").eq("org_id", ORG).eq("source_charge_id", reduction.charge_id);
        expect((afterReplay ?? []), "three deliveries, one compensating consequence").toHaveLength(1);
        const stillPosted = await chargeRow(reduction.charge_id);
        expect(stillPosted!.amount_cents).toBe(postedBefore!.amount_cents);
        expect(stillPosted!.posted_at).toBe(postedBefore!.posted_at);
    });

    // ── A → B → C — the correction of a correction ──────────────────────────

    it("chain — A absent, B attended, C absent again: the latest truth decides, and nothing resurrects", async () => {
        await creditPolicy();
        const a = await absence(`t7-4d-a-${run}`, DATES.chain);
        await react(a.id);
        const creditA = (await obligationsOn(DATES.chain)).find((o) => o.obligation_kind === "vacation_credit")!;
        const reductionA = (await reductionsFor([creditA.id]))[0]!;
        const contraA = reductionA.charge_id;
        expect(await chargeStatus(contraA)).toBe("draft");

        // B — the child attended after all. The credit must go.
        const b = await correctToAttended(a.id, `t7-4d-b-${run}`, DATES.chain);
        await react(b.id);
        expect(await chargeStatus(contraA), "B withdraws A's money").toBe("void");

        // C — B was itself wrong. The child WAS away, and the credit is owed again.
        const c = await correctToAbsent(b.id, `t7-4d-c-${run}`, DATES.chain);
        await react(c.id);

        const afterC = await obligationsOn(DATES.chain);
        const liveCredits = afterC.filter((o) => o.obligation_kind === "vacation_credit" && o.status !== "superseded");
        const allReductions = await reductionsFor(afterC.map((o) => o.id));
        const live = [] as Array<{ reduction: string; charge: string; amount: number }>;
        for (const r of allReductions) {
            if ((await chargeStatus(r.charge_id)) === "draft") live.push({ reduction: r.id, charge: r.charge_id, amount: r.amount_cents });
        }

        // eslint-disable-next-line no-console
        console.log("SLICE4-CHAIN", JSON.stringify({
            factA: a.id, factB: b.id, factC: c.id,
            obligationA: creditA.id, reductionA: reductionA.id, contraA,
            contraAStatus: await chargeStatus(contraA),
            obligationsAfterC: afterC.map((o) => ({ id: o.id, kind: o.obligation_kind, status: o.status })),
            liveMoney: live,
        }, null, 1));

        /*
         * THE LATEST TRUTH DECIDES. C says away, the policy says credit, so a credit is owed again —
         * and it must be a NEW consequence, not the voided one brought back. `reductionCore` treats
         * withdrawn money as settled precisely so a replay cannot resurrect it; the chain has to
         * reach the same answer by producing current money rather than reviving historical money.
         */
        expect(liveCredits.length, "C leaves exactly one live vacation obligation").toBe(1);
        // The obligation is REINSTATED by resolution key rather than re-created: same id, back to
        // `previewed` under C's event. Lineage is coherent and the reparenting works.
        expect(liveCredits[0]!.id).toBe(creditA.id);

        /*
         * AND THE WITHDRAWN ARTIFACT IS NOT RESURRECTED — which is the law working, and is also
         * exactly why C currently ends with no money at all. See the KNOWN GAP below.
         */
        expect(live.some((m) => m.charge === contraA), "the voided artifact stays voided").toBe(false);

        /*
         * HISTORY SURVIVES — as reinstatement, not as a second row. The obligation A produced is the
         * one C brings back, so the lineage is a single thread through three facts rather than a
         * pile of look-alikes. Its application row and its withdrawn artifact both remain readable.
         */
        expect(afterC.some((o) => o.id === creditA.id), "A's obligation is the one C reinstates").toBe(true);
        expect(allReductions.some((r) => r.id === reductionA.id), "A's application row remains as provenance").toBe(true);
        expect(await chargeStatus(contraA), "A's money stays withdrawn").toBe("void");
    });

    /*
     * KNOWN GAP, LOCKED AS A FAILING LAW RATHER THAN HIDDEN.
     *
     * When C restores a truth that again warrants a credit, the family should be credited again.
     * Measured: the obligation is correctly reinstated to `previewed` (same id, reparented under
     * C's event) and NO money answers it. Two things combine.
     *
     * First, the correction path never runs the reduction writer at all — it reconciles
     * obligations and returns, so a corrected truth that newly warrants money cannot get any.
     * Second, even if it did, the writer's idempotency is anchored on the obligation id alone, and
     * that obligation already has an application whose contra charge is void — which `reductionCore`
     * correctly refuses to revive.
     *
     * The fix is a pair, not a patch: run the writer on the correction path, and let the
     * idempotency key carry the incarnation (the obligation AND the consumption event that
     * reinstated it) so a reinstated consequence is a new consequence rather than a resurrection.
     * That is a design change, and it is reported rather than rushed in.
     */
    it("chain — C restores the credit as a NEW incarnation, and replay does not multiply it", async () => {
        await creditPolicy();
        const a = await absence(`t7-4f-a-${run}`, DATES.chainGap);
        await react(a.id);
        const creditA = (await obligationsOn(DATES.chainGap)).find((o) => o.obligation_kind === "vacation_credit")!;
        const b = await correctToAttended(a.id, `t7-4f-b-${run}`, DATES.chainGap);
        await react(b.id);
        const c = await correctToAbsent(b.id, `t7-4f-c-${run}`, DATES.chainGap);
        await react(c.id);

        const afterC = await obligationsOn(DATES.chainGap);
        const reductions = await reductionsFor(afterC.map((o) => o.id));
        const liveAmounts: number[] = [];
        for (const r of reductions) {
            if ((await chargeStatus(r.charge_id)) === "draft") liveAmounts.push(r.amount_cents);
        }
        expect(creditA.id).toBeTruthy();
        expect(liveAmounts, "the restored truth carries exactly one live credit").toHaveLength(1);

        /*
         * A NEW INCARNATION, NOT A REVIVAL. Same logical obligation, new application, new contra
         * charge; the first application and its voided charge both remain, individually readable.
         */
        // Sorted by the CHARGE's own status, never by amount — both incarnations are worth the same
        // money, which is the point, and an amount-based filter silently found nothing withdrawn.
        const liveRows: typeof reductions = [];
        const withdrawnRows: typeof reductions = [];
        for (const r of reductions) {
            ((await chargeStatus(r.charge_id)) === "draft" ? liveRows : withdrawnRows).push(r);
        }
        expect(reductions.length, "both incarnations are readable").toBeGreaterThanOrEqual(2);
        expect(liveRows, "exactly one of them is current").toHaveLength(1);
        expect(withdrawnRows.length, "and the earlier one remains, withdrawn").toBeGreaterThan(0);
        for (const w of withdrawnRows) expect(await chargeStatus(w.charge_id)).toBe("void");
        expect(liveRows[0]!.id, "the restored credit is a NEW application").not.toBe(withdrawnRows[0]!.id);
        expect(liveRows[0]!.charge_id, "on a NEW contra artifact").not.toBe(withdrawnRows[0]!.charge_id);

        // REPLAY C — the incarnation identity is what stops a third delivery minting a third credit.
        await react(c.id);
        await react(c.id);
        const afterReplay = await reductionsFor((await obligationsOn(DATES.chainGap)).map((o) => o.id));
        expect(afterReplay.length, "replaying C mints nothing new").toBe(reductions.length);
        const liveAfter: string[] = [];
        for (const r of afterReplay) {
            if ((await chargeStatus(r.charge_id)) === "draft") liveAfter.push(r.id);
        }
        expect(liveAfter, "one live credit after three deliveries of C").toHaveLength(1);
    });

    // ── Reverse traceability — walked through persisted rows only ───────────

    it("reverse — from a correction fact alone, every affected artifact is reachable", async () => {
        await creditPolicy();
        const original = await absence(`t7-4e-${run}`, DATES.reverse);
        await react(original.id);
        const credit = (await obligationsOn(DATES.reverse)).find((o) => o.obligation_kind === "vacation_credit")!;
        const reduction = (await reductionsFor([credit.id]))[0]!;
        await postChildcareCharge(supabase, { orgId: ORG, chargeId: reduction.charge_id, actorUserId: null });
        const correction = await correctToAttended(original.id, `t7-4e-corr-${run}`, DATES.reverse);
        await react(correction.id);

        /*
         * THE WALK. Nothing below is carried from the setup above except the one id an auditor
         * would actually start from — the correction fact. Every other id is resolved from
         * persisted rows, because an audit that needs the test's memory is not an audit.
         */
        const startingPoint = correction.id;

        const { data: correctionFact } = await supabase
            .from("child_attendance_events").select("id, corrects_event_id, entry_type, service_date")
            .eq("org_id", ORG).eq("id", startingPoint).single();
        const correctedSourceId = (correctionFact as { corrects_event_id: string }).corrects_event_id;
        expect(correctedSourceId, "1. the correction names what it corrected").toBe(original.id);

        const { data: priorEvents } = await supabase
            .from("consumption_events").select("id")
            .eq("org_id", ORG).eq("source_entity_type", "child_attendance_events").eq("source_entity_id", correctedSourceId);
        const priorEventId = ((priorEvents ?? []) as Array<{ id: string }>)[0]?.id;
        expect(priorEventId, "2. the corrected source reaches its consumption event").toBeTruthy();

        const { data: obligations } = await supabase
            .from("resolved_obligations").select("id, status, obligation_kind")
            .eq("consumption_event_id", priorEventId!);
        const superseded = ((obligations ?? []) as Array<{ id: string; status: string; obligation_kind: string }>)
            .find((o) => o.obligation_kind === "vacation_credit");
        expect(superseded?.status, "3. the obligation it produced is superseded").toBe("superseded");

        const { data: applications } = await supabase
            .from("financial_reduction_applications")
            .select("id, charge_id, financial_policy_id, policy_snapshot")
            .eq("org_id", ORG).eq("resolved_obligation_id", superseded!.id);
        const application = ((applications ?? []) as Array<{ id: string; charge_id: string; financial_policy_id: string | null; policy_snapshot: Record<string, unknown> }>)[0];
        expect(application, "4. the obligation reaches the reduction it authorised").toBeTruthy();
        expect(application!.financial_policy_id, "and the policy that decided it").toBeTruthy();
        expect(application!.policy_snapshot.accepted_term_id, "and the accepted term it was valued against").toBeTruthy();

        const originalCharge = await chargeRow(application!.charge_id);
        expect(originalCharge!.status, "5. the original artifact, still posted").toBe("posted");

        const { data: comp } = await supabase
            .from("charges").select("id, amount_cents, source_charge_id")
            .eq("org_id", ORG).eq("source_charge_id", application!.charge_id);
        const compensating = ((comp ?? []) as Array<{ id: string; amount_cents: number }>);
        expect(compensating, "6. and the compensating consequence that answers it").toHaveLength(1);
        expect(compensating[0]!.amount_cents).toBe(-originalCharge!.amount_cents);
    });
});

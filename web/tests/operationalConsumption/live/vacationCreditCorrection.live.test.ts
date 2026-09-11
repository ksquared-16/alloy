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
const DATES = { draftCorrection: dayOffset(10), replay: dayOffset(11), chain: dayOffset(12) } as const;

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
            await supabase.from("financial_reduction_applications").delete().in("id", rows.map((r) => r.id));
            await supabase.from("charges").delete().in("id", rows.map((r) => r.charge_id));
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
                    await supabase.from("financial_reduction_applications").delete().in("id", rows.map((r) => r.id));
                    await supabase.from("charges").delete().in("id", rows.map((r) => r.charge_id));
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
});

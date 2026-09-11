/**
 * SLICE 3A — the billing period a vacation credit belongs to, and what happens
 * when its value cannot be resolved.
 *
 * The period now comes from the canonical owner (`billingPeriodForDate` /
 * `billingPeriodDays`) — the same module `resolveTuitionRecurrence` uses to reach
 * its own `periodDays` — carried onto the fact by the reactor rather than
 * calculated there.
 *
 * The second half of this suite records a finding rather than a success: a
 * granted credit whose amount cannot be resolved must not look like a commercial
 * refusal.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { billingPeriodDays, billingPeriodForDate } from "@/lib/financials/billingPeriod";
import { createFinancialPolicy } from "@/lib/financials/policies/financialPolicyService";
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
const TODAY = new Date().toISOString().slice(0, 10);
const run = Date.now();

describeLive("vacation credit valuation — period context and fail-closed", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const factIds: string[] = [];

    async function clearPolicies() {
        await supabase.from("financial_policies").delete().eq("org_id", ORG).eq("policy_type", "vacation_credit");
    }
    async function cleanup() {
        await clearPolicies();
        const { data } = await supabase
            .from("consumption_events")
            .select("id")
            .eq("org_id", ORG)
            .eq("source_entity_type", "child_attendance_events")
            .in("source_entity_id", factIds.length ? factIds : ["00000000-0000-0000-0000-000000000000"]);
        const ids = ((data ?? []) as Array<{ id: string }>).map((e) => e.id);
        if (ids.length) {
            await supabase.from("resolved_obligations").delete().in("consumption_event_id", ids);
            await supabase.from("consumption_events").delete().in("id", ids);
        }
    }

    const credit = () =>
        createFinancialPolicy(supabase, {
            orgId: ORG, policyType: "vacation_credit", scopeType: "org",
            value: { treatment: "credit" }, effectiveStart: "2026-01-01",
        } as Parameters<typeof createFinancialPolicy>[1]);

    const absenceOn = async (serviceDate: string, key: string) => {
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
    };

    beforeAll(cleanup);
    afterEach(clearPolicies);
    afterAll(cleanup);

    // ── The canonical period, carried not calculated ────────────────────────

    it("the period comes from the canonical owner, including at both boundaries", () => {
        /*
         * Asserted against the module tuition generation itself uses, so the
         * credit's denominator and the tuition's denominator cannot disagree.
         */
        const first = billingPeriodForDate("2026-02-01");
        const last = billingPeriodForDate("2026-02-28");
        expect(first.key).toBe("2026-02");
        expect(last.key).toBe("2026-02");
        expect(first.start).toBe("2026-02-01");
        expect(first.end).toBe("2026-02-28");
        // A leap February, without a month-length table or a special case.
        expect(billingPeriodDays(billingPeriodForDate("2028-02-10"))).toBe(29);
        expect(billingPeriodDays(billingPeriodForDate("2026-02-10"))).toBe(28);
        expect(billingPeriodDays(billingPeriodForDate("2026-09-30"))).toBe(30);
        expect(billingPeriodDays(billingPeriodForDate("2026-10-01"))).toBe(31);
    });

    it("the reactor carries the resolved period onto the consumption event", async () => {
        await credit();
        const fact = await absenceOn(TODAY, `t7-3a-period-${run}`);
        const outcome = await reactToAttendanceFact(supabase, {
            orgId: ORG, attendanceEventId: fact.id, today: TODAY,
        });
        expect(outcome.status).toBe("consumed");
        if (outcome.status !== "consumed") return;

        const { data: obs } = await supabase
            .from("resolved_obligations")
            .select("obligation_kind, period_start, period_end, explanation, review_required, status")
            .eq("consumption_event_id", outcome.consumptionEventId!);
        const ob = (obs ?? [])[0] as {
            obligation_kind: string; period_start: string | null; period_end: string | null;
            explanation: Record<string, unknown>; review_required: boolean; status: string;
        };
        expect(ob).toBeTruthy();
        expect(ob.obligation_kind).toBe("vacation_credit");

        const period = billingPeriodForDate(TODAY);
        expect(ob.period_start).toBe(period.start);
        expect(ob.period_end).toBe(period.end);
        // The denominator is the canonical period length, not a guess.
        expect(ob.explanation.period_days).toBe(billingPeriodDays(period));
    });

    // ── The finding: a granted credit that cannot be valued ─────────────────

    it("a granted credit with no resolvable rate fails CLOSED into review, not into silence", async () => {
        await credit();
        const fact = await absenceOn(TODAY, `t7-3a-unvalued-${run}`);
        const outcome = await reactToAttendanceFact(supabase, {
            orgId: ORG, attendanceEventId: fact.id, today: TODAY,
        });
        expect(outcome.status).toBe("consumed");
        if (outcome.status !== "consumed") return;

        const { data: obs } = await supabase
            .from("resolved_obligations")
            .select("amount_cents, review_required, status, explanation")
            .eq("consumption_event_id", outcome.consumptionEventId!);
        const ob = (obs ?? [])[0] as {
            amount_cents: number | null; review_required: boolean; status: string;
            explanation: Record<string, unknown>;
        };

        // No money was invented.
        expect(ob.amount_cents).toBeNull();
        /*
         * And it is NOT reported as a commercial refusal. Commerce granted this
         * credit; only its value is unknown. Left as a bare `no_charge` it would
         * be indistinguishable from a `no_credit` policy, and a family would
         * quietly not receive money the organisation decided they were owed.
         */
        expect(ob.review_required).toBe(true);
        expect(ob.explanation.unresolved_valuation).toBe("no_rate_resolved");
        expect(ob.explanation.review_reason).toContain("could not be resolved");
    });

    it("a refusal and an unresolved valuation are distinguishable in the record", async () => {
        // no_credit: commerce decided. No obligation at all.
        await createFinancialPolicy(supabase, {
            orgId: ORG, policyType: "vacation_credit", scopeType: "org",
            value: { treatment: "no_credit" }, effectiveStart: "2026-01-01",
        } as Parameters<typeof createFinancialPolicy>[1]);
        const fact = await absenceOn(TODAY, `t7-3a-refused-${run}`);
        const outcome = await reactToAttendanceFact(supabase, {
            orgId: ORG, attendanceEventId: fact.id, today: TODAY,
        });
        expect(outcome.status).toBe("consumed");
        if (outcome.status !== "consumed") return;

        // Zero obligations — nothing was granted, so there is nothing to review.
        expect(outcome.obligationIds).toHaveLength(0);
    });
});

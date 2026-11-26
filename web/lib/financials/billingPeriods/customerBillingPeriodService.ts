/**
 * MATERIALISING A CUSTOMER'S COMMERCIAL BILLING PERIODS.
 *
 * A billing period exists because the account's commercial calendar says it exists, not because
 * money happened to land in it — which is why an empty period is legitimate and closes normally.
 * So this writes the CURRENT period and the NEXT one, and stops. An unbounded future calendar would
 * be rows asserting bounds that configuration may still change before anyone bills against them.
 *
 * ── THE PERIOD ARITHMETIC IS NOT HERE ──
 *
 * Bounds come from `billingPeriod.ts`, the one authority that tiles cadences, exactly as the
 * accounting materialiser takes its shapes from `accountingPeriod.ts`. A second generator would be
 * a second answer to "when does November end". This module decides WHICH calendar applies and
 * persists what that authority returns.
 *
 * ── IT REFUSES RATHER THAN GUESSES ──
 *
 * `resolveCustomerBillingCalendar` returns `ambiguous_locations` for an account with children at
 * more than one location and no explicit account calendar. That is not an error to be smoothed
 * over: it is the configuration case the deployed census found three live examples of, and the
 * answer is that an operator must say which calendar governs the combined account. This returns
 * that outcome unchanged and writes nothing.
 *
 * ── SIDE-EFFECT FREE BY DESIGN ──
 *
 * Nothing in the existing economics calls this. No charge, reduction, payment, journal or Autopay
 * path reads `financial_billing_periods` yet, and no write here touches an existing row. The
 * foundation is proved on its own before anything binds to it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { addDaysYmd, billingPeriodFor, type BillingPeriod } from "@/lib/financials/billingPeriod";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";
import {
    BILLING_CALENDAR_POLICY_TYPE,
    resolveCustomerBillingCalendar,
    type CustomerBillingCalendarResolution,
    type ResolvedCustomerBillingCalendar,
} from "@/lib/financials/billingPeriods/resolveCustomerBillingCalendar";

/**
 * The agreement statuses that are a LIVE commercial relationship.
 *
 * All three bill: `pending_start` is accepted and not yet begun — and a household enrolling next
 * month still needs a calendar now, because the first bill is generated before the period opens —
 * and `ending` is winding down but has not stopped. A status outside this set is not a commercial
 * relationship and must not contribute a location, or a withdrawn family would keep defining the
 * calendar of the account it left.
 */
export const LIVE_AGREEMENT_STATUSES = ["pending_start", "active", "ending"] as const;

/** Which locations an account holds a live commercial relationship with, on a date. */
export async function readCustomerActiveLocationIds(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string; onDate: string },
): Promise<string[]> {
    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("site_location_id, status, end_date, customer_id, customer_member_id")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .in("status", [...LIVE_AGREEMENT_STATUSES]);
    if (error) throw new Error(`billing calendar: reading agreements failed — ${error.message}`);
    const rows = (data ?? []) as { site_location_id: string | null; end_date: string | null }[];
    const live = rows.filter((r) => {
        /*
         * An agreement that ENDED before this date no longer defines the account's calendar. An
         * open-ended one (`end_date` null) does, and so does a future one, which is why the start
         * date is deliberately not a filter here.
         */
        const end = (r.end_date ?? "").trim();
        return !end || end >= args.onDate;
    });
    return [...new Set(live.map((r) => (r.site_location_id ?? "").trim()).filter(Boolean))];
}

async function readBillingCalendarPolicies(
    supabase: SupabaseClient,
    orgId: string,
): Promise<FinancialPolicyRow[]> {
    const { data, error } = await supabase
        .from("financial_policies")
        .select("*")
        .eq("org_id", orgId)
        .eq("policy_type", BILLING_CALENDAR_POLICY_TYPE);
    if (error) throw new Error(`billing calendar: reading policies failed — ${error.message}`);
    return (data ?? []) as FinancialPolicyRow[];
}

/** Resolve the calendar governing one account, reading both of its inputs. */
export async function resolveCustomerCalendar(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string; onDate: string },
): Promise<CustomerBillingCalendarResolution> {
    const [policies, activeLocationIds] = await Promise.all([
        readBillingCalendarPolicies(supabase, args.orgId),
        readCustomerActiveLocationIds(supabase, args),
    ]);
    return resolveCustomerBillingCalendar({
        policies,
        activeLocationIds,
        customerId: args.customerId,
        onDate: args.onDate,
    });
}

/**
 * The current period and the one after it, from the resolved calendar.
 *
 * Monthly ignores the anchor entirely — a monthly commercial period IS the calendar month — so the
 * date passed in its place is never read. Pure, so the bounds can be asserted without a database.
 */
export function currentAndNextPeriods(
    calendar: Pick<ResolvedCustomerBillingCalendar, "cadence" | "anchorOn">,
    onDate: string,
): { current: BillingPeriod; next: BillingPeriod } {
    const anchor = calendar.anchorOn ?? onDate;
    const current = billingPeriodFor(calendar.cadence, anchor, onDate);
    const next = billingPeriodFor(calendar.cadence, anchor, addDaysYmd(current.end, 1));
    return { current, next };
}

export type MaterializedPeriod = {
    periodKey: string;
    startsOn: string;
    endsOn: string;
    status: string;
    created: boolean;
};

export type MaterializeOutcome =
    | { kind: "materialized"; calendar: ResolvedCustomerBillingCalendar; periods: MaterializedPeriod[] }
    /* The calendar could not be decided, so no period is invented. Carries the reason verbatim. */
    | { kind: "not_materialized"; resolution: CustomerBillingCalendarResolution };

/**
 * Ensure the current and next commercial periods exist for one account.
 *
 * IDEMPOTENT: a period already present is left exactly as it is, including its status — re-running
 * this must never reopen a closed period or restate the bounds economics have bound to. The
 * database says the same thing twice over, through the `(org, customer, period_key)` unique
 * constraint and the frozen-bounds trigger; this inserts only what is missing so the ordinary path
 * does not rely on an error to be correct.
 */
export async function materializeCustomerBillingPeriods(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string; onDate: string },
): Promise<MaterializeOutcome> {
    const resolution = await resolveCustomerCalendar(supabase, args);
    if (resolution.kind !== "resolved") return { kind: "not_materialized", resolution };

    const { current, next } = currentAndNextPeriods(resolution, args.onDate);
    const wanted = [current, next];

    const { data: existingRows, error: readError } = await supabase
        .from("financial_billing_periods")
        .select("period_key, starts_on, ends_on, status")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .in("period_key", wanted.map((p) => p.key));
    if (readError) throw new Error(`billing periods: reading existing failed — ${readError.message}`);
    const existing = new Map(
        ((existingRows ?? []) as { period_key: string; starts_on: string; ends_on: string; status: string }[])
            .map((r) => [r.period_key, r]),
    );

    const missing = wanted.filter((p) => !existing.has(p.key));
    if (missing.length > 0) {
        const { error: writeError } = await supabase.from("financial_billing_periods").insert(
            missing.map((p) => ({
                org_id: args.orgId,
                customer_id: args.customerId,
                period_key: p.key,
                cadence: resolution.cadence,
                starts_on: p.start,
                ends_on: p.end,
                anchor_on: resolution.anchorOn,
                status: "open",
                calendar_scope: resolution.scope,
                calendar_policy_id: resolution.policyId,
                calendar_source_location_id: resolution.sourceLocationId,
                calendar_snapshot: resolution.snapshot,
            })),
        );
        /*
         * A concurrent materialisation is not a failure: the unique constraint is doing its job and
         * the row the other writer created is the row this one wanted. Anything else is reported.
         */
        if (writeError && !/duplicate key|unique constraint/i.test(writeError.message)) {
            throw new Error(`billing periods: materialising failed — ${writeError.message}`);
        }
    }

    return {
        kind: "materialized",
        calendar: resolution,
        periods: wanted.map((p) => {
            const had = existing.get(p.key);
            return {
                periodKey: p.key,
                startsOn: had?.starts_on ?? p.start,
                endsOn: had?.ends_on ?? p.end,
                status: had?.status ?? "open",
                created: !had,
            };
        }),
    };
}

export type CustomerPeriodForDate =
    | {
          kind: "resolved";
          /** Present when the period is already persisted — then its stored bounds are the answer. */
          periodId: string | null;
          periodKey: string;
          startsOn: string;
          endsOn: string;
          status: "open" | "closed";
          /** The calendar that governs the account now (null when only a persisted row answered). */
          calendar: ResolvedCustomerBillingCalendar | null;
      }
    | { kind: "unresolved"; resolution: CustomerBillingCalendarResolution };

/**
 * THE PERIOD CONTAINING A DATE — READ ONLY.
 *
 * `materializeCustomerBillingPeriods` WRITES the period it finds, which is right for a charge being
 * created and wrong for a preview: a hover or a "what would this do?" must not mint billing periods.
 * This answers the same question without writing. A persisted period covering the date wins —
 * exactly as the binder reads it back — so preview and commit name the same bounds; otherwise the
 * bounds come from the calendar through the same tiling authority the materialiser uses.
 */
export async function resolveCustomerPeriodForDate(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string; onDate: string },
): Promise<CustomerPeriodForDate> {
    const { data, error } = await supabase
        .from("financial_billing_periods")
        .select("id, period_key, starts_on, ends_on, status")
        .eq("org_id", args.orgId)
        .eq("customer_id", args.customerId)
        .lte("starts_on", args.onDate)
        .gte("ends_on", args.onDate)
        .maybeSingle();
    if (error) throw new Error(`billing periods: reading the covering period failed — ${error.message}`);
    const resolution = await resolveCustomerCalendar(supabase, args);
    const calendar = resolution.kind === "resolved" ? resolution : null;
    const row = data as { id: string; period_key: string; starts_on: string; ends_on: string; status: string } | null;
    if (row) {
        return {
            kind: "resolved",
            periodId: row.id,
            periodKey: row.period_key,
            startsOn: row.starts_on,
            endsOn: row.ends_on,
            status: row.status === "closed" ? "closed" : "open",
            calendar,
        };
    }
    if (!calendar) return { kind: "unresolved", resolution };
    const { current } = currentAndNextPeriods(calendar, args.onDate);
    return {
        kind: "resolved",
        periodId: null,
        periodKey: current.key,
        startsOn: current.start,
        endsOn: current.end,
        status: "open",
        calendar,
    };
}

/**
 * FINANCIALS METRIC PACK — money, scoped, from the threads that own it.
 *
 * ── WHAT THIS FILE IS ALLOWED TO DO ──
 *
 * Choose a cohort, hand it to a canonical projection, read one figure out, convert cents to
 * the dollars the metric format renders, and say which scope answered. That is the whole
 * remit, and it is why the file is short.
 *
 * ── WHAT IT MUST NEVER DO ──
 *
 * Add, subtract or bound money. `resolveFinancialPositionCohort` and
 * `resolveFinancialPaymentFlow` do the reading, and the arithmetic inside them is
 * `computeCollectiblePosition` — the same function `resolveFamilyCollectible` uses for the
 * card an operator opens from the workspace. A metric that did its own sums would be a second
 * financial authority reachable from a KPI tile, which is the worst place to keep one.
 *
 * ── LOCATION IS NOT DECORATION ──
 *
 * Every resolver passes the operator's OWN rights (`ctx.scope.siteScope`,
 * `allowedSiteLocationIds`) and the selected site into the projection, which intersects them
 * with each row's provenance under Thread 4's contract. A site filter therefore narrows the
 * number and can never widen it, and household-sourced money — which belongs to no site —
 * appears only at org scope and only to an org-wide operator. Passing a site through here
 * without those rights would let a KPI tile answer a question the queue below it refuses.
 *
 * ── AND THE TWO WORDS THAT ARE NOT HERE ──
 *
 * Nothing in this pack is called Accounts Receivable or Revenue. See `registry.ts` for why:
 * there is no receivables accounting and no revenue-recognition model to make either name
 * true, and a metric label is exactly where a false accounting semantic would take hold.
 */

import type { MetricResolveContext, OipMetricKey, ResolvedMetricValue } from "@/lib/metrics/types";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { buildMetricResultBase } from "@/lib/metrics/resolvers/metricResolveBase";
import {
    resolveFinancialPositionCohort,
    type FinancialPositionCohort,
} from "@/lib/financials/workspace/resolveFinancialPosition";
import {
    resolveFinancialPaymentFlow,
    type FinancialPaymentFlow,
} from "@/lib/financials/workspace/resolveFinancialPaymentFlow";
import { resolveFinancialWorkQueue } from "@/lib/financials/workspace/resolveFinancialWorkQueue";

/** The operator's own rights and the selected site, in the shape every projection takes. */
function financialScopeArgs(ctx: MetricResolveContext) {
    return {
        orgId: ctx.orgId,
        siteScope: ctx.scope.siteScope === "all" ? ("all" as const) : ("restricted" as const),
        allowedSiteLocationIds: ctx.scope.allowedSiteLocationIds ?? [],
        activeSiteLocationId: ctx.siteLocationId ?? null,
    };
}

/** Cents are the truth; dollars are what `format: "currency"` renders. Both are reported. */
function currencyResult(
    ctx: MetricResolveContext,
    key: OipMetricKey,
    cents: number,
    meta: Record<string, unknown>,
): ResolvedMetricValue {
    const def = getMetricDefinition(key);
    const base = buildMetricResultBase(ctx, def, ctx.now ?? new Date());
    const dollars = cents / 100;
    return {
        ...base,
        value: dollars,
        formattedValue: formatMetricValue(def.format, dollars),
        meta: { amount_cents: cents, ...meta },
    };
}

function countResult(
    ctx: MetricResolveContext,
    key: OipMetricKey,
    count: number,
    meta: Record<string, unknown>,
): ResolvedMetricValue {
    const def = getMetricDefinition(key);
    const base = buildMetricResultBase(ctx, def, ctx.now ?? new Date());
    return {
        ...base,
        value: count,
        formattedValue: formatMetricValue(def.format, count),
        meta,
    };
}

/** The provenance every money metric carries, so a tile can explain where its number stops. */
function cohortMeta(cohort: FinancialPositionCohort): Record<string, unknown> {
    return {
        charges: cohort.counts.charges,
        households: cohort.counts.households,
        site_scope: cohort.scope.siteScope,
        active_site_location_id: cohort.scope.siteLocationId,
        truncated: cohort.truncated,
        scan_cap: cohort.scanCap,
        snapshot_semantics: true,
    };
}

function flowMeta(flow: FinancialPaymentFlow): Record<string, unknown> {
    return {
        households: flow.counts.households,
        site_scope: flow.scope.siteScope,
        active_site_location_id: flow.scope.siteLocationId,
        truncated: flow.truncated,
        scan_cap: flow.scanCap,
        snapshot_semantics: true,
    };
}

export async function resolveFinancialsOutstandingAmount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const cohort = await resolveFinancialPositionCohort(ctx.supabase, financialScopeArgs(ctx));
    return currencyResult(ctx, "financials.outstanding_amount", cohort.totals.outstandingCents, {
        ...cohortMeta(cohort),
        charges_with_outstanding: cohort.counts.chargesWithOutstanding,
    });
}

export async function resolveFinancialsCurrentlyCollectibleAmount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const cohort = await resolveFinancialPositionCohort(ctx.supabase, financialScopeArgs(ctx));
    return currencyResult(ctx, "financials.currently_collectible_amount", cohort.totals.currentlyCollectibleCents, {
        ...cohortMeta(cohort),
        // The suppression is reported so a smaller collectible figure can be explained rather
        // than looking like money that went missing.
        outstanding_cents: cohort.totals.outstandingCents,
        submitted_claim_suppression_cents: cohort.totals.submittedClaimSuppressionCents,
    });
}

export async function resolveFinancialsGrossChargesPostedAmount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const base = buildMetricResultBase(ctx, getMetricDefinition("financials.gross_charges_posted_amount"), ctx.now ?? new Date());
    const cohort = await resolveFinancialPositionCohort(ctx.supabase, {
        ...financialScopeArgs(ctx),
        postedFromIso: base.windowStartIso,
        postedToIso: base.windowEndIso,
    });
    return currencyResult(ctx, "financials.gross_charges_posted_amount", cohort.totals.grossChargesCents, {
        ...cohortMeta(cohort),
        // Net is carried beside gross, never instead of it: a reduction is a separate decision
        // with its own record, and collapsing the two would hide it.
        net_charges_cents: cohort.totals.netChargesCents,
    });
}

export async function resolveFinancialsPaymentsReceivedAmount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const base = buildMetricResultBase(ctx, getMetricDefinition("financials.payments_received_amount"), ctx.now ?? new Date());
    const flow = await resolveFinancialPaymentFlow(ctx.supabase, {
        ...financialScopeArgs(ctx),
        receivedFromIso: base.windowStartIso,
        receivedToIso: base.windowEndIso,
    });
    return currencyResult(ctx, "financials.payments_received_amount", flow.totals.receivedCents, {
        ...flowMeta(flow),
        payments: flow.counts.received,
        // Refunds are stated, not subtracted — a netted figure would hide both movements.
        refunded_cents: flow.totals.refundedCents,
        refunds: flow.counts.refunds,
    });
}

export async function resolveFinancialsUnappliedPaymentsAmount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const flow = await resolveFinancialPaymentFlow(ctx.supabase, financialScopeArgs(ctx));
    return currencyResult(ctx, "financials.unapplied_payments_amount", flow.totals.unappliedCents, {
        ...flowMeta(flow),
        payments: flow.counts.unapplied,
    });
}

export async function resolveFinancialsUnresolvedSubsidyVarianceAmount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    const cohort = await resolveFinancialPositionCohort(ctx.supabase, financialScopeArgs(ctx));
    return currencyResult(ctx, "financials.unresolved_subsidy_variance_amount", cohort.totals.unresolvedVarianceCents, {
        ...cohortMeta(cohort),
        charges_with_open_variance: cohort.counts.chargesWithOpenVariance,
    });
}

export async function resolveFinancialsChargesAwaitingPostCount(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    /*
     * THE SAME PROJECTION THE QUEUE READS. A second "count the drafts" query filtered the same
     * way is how a tile comes to show 7 above a list of 6, and no operator can be asked to
     * reconcile that.
     */
    const queue = await resolveFinancialWorkQueue(ctx.supabase, financialScopeArgs(ctx));
    return countResult(ctx, "financials.charges_awaiting_post_count", queue.counts.actionable, {
        households: queue.counts.households,
        site_scoped: queue.counts.siteScoped,
        org_scoped: queue.counts.orgScoped,
        site_scope: queue.scope.siteScope,
        active_site_location_id: queue.scope.siteLocationId,
        snapshot_semantics: true,
    });
}

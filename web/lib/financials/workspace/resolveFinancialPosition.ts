/**
 * THE CROSS-HOUSEHOLD FINANCIAL POSITION — many charges, one calculation.
 *
 * `resolveFinancialWorkQueue` is the workspace's SELECTION projection and is forbidden from
 * totalling anything. This is its counterpart for money, and it is allowed to total precisely
 * because it computes nothing: every figure comes from `computeCollectiblePosition`, the same
 * pure function `resolveFamilyCollectible` uses for the card an operator opens next. The
 * difference between the two is the reading, not the reasoning — one charge's facts against
 * many charges' facts, batched.
 *
 * That is the whole guarantee, and it is the one worth stating: a workspace total and a family
 * card cannot disagree, because there is nothing here that could disagree with. Nothing in this
 * file adds, subtracts or bounds money.
 *
 * ── WHAT IT IS NOT ──
 *
 * Not Accounts Receivable. Not revenue. Not a ledger. `outstandingCents` is Thread 8's
 * predicate, summed over a scoped cohort, and it is called Outstanding for that reason. No
 * figure here is derived from `financial_journal_entries` or `gl_journal_entries`, and none is
 * persisted.
 *
 * ── LOCATION ──
 *
 * Thread 4's contract, unchanged and quoted: enrolment-backed money resolves to its agreement's
 * site; household-sourced money is org-scoped and visible only at org scope to an org-wide
 * operator; job-vertical money is not childcare financial work; money whose location cannot be
 * resolved is WITHHELD rather than placed somewhere plausible. A site filter narrows and can
 * never widen.
 *
 * ── BOUNDED, AND HONEST ABOUT IT ──
 *
 * The charge scan is capped. A cap that is silently hit is how a workspace shows a number that
 * is quietly wrong, so `truncated` is returned beside the totals and every metric built on this
 * declares snapshot semantics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import {
    computeCollectiblePosition,
    type CollectiblePosition,
} from "@/lib/financials/subsidy/collectiblePosition";
import {
    isFinancialWorkVisible,
    resolveFinancialWorkLocation,
    type FinancialWorkLocationScope,
} from "@/lib/financials/workspace/financialWorkLocation";

/** How many charges one position read will look at. */
export const FINANCIAL_POSITION_SCAN_CAP = 2000;

export type FinancialPositionRow = {
    position: CollectiblePosition;
    customerId: string | null;
    /** The household's own name, so an accounts list names families rather than ids. */
    householdName: string | null;
    enrollmentAgreementId: string | null;
    serviceDate: string | null;
    postedAt: string | null;
    periodKey: string | null;
    locationScope: FinancialWorkLocationScope;
    siteLocationId: string | null;
};

export type FinancialPositionTotals = {
    /** Thread 8, summed. Never called A/R — there is no receivables accounting behind it. */
    outstandingCents: number;
    /** Thread 9's governed figure, summed: outstanding less submitted-claim suppression. */
    currentlyCollectibleCents: number;
    expectedSubsidyCents: number;
    submittedClaimSuppressionCents: number;
    actualSubsidyReceivedCents: number;
    /** Signed, and never folded into anything. Negative is short-paid or denied. */
    unresolvedVarianceCents: number;
    /** Thread 1's gross, and Thread 10's reductions, on the posted cohort. Not revenue. */
    grossChargesCents: number;
    netChargesCents: number;
};

export type FinancialPositionCohort = {
    rows: FinancialPositionRow[];
    totals: FinancialPositionTotals;
    counts: {
        charges: number;
        households: number;
        chargesWithOutstanding: number;
        chargesWithOpenVariance: number;
        chargesWithUnassignedResponsibility: number;
    };
    scope: { siteLocationId: string | null; siteScope: "all" | "restricted" };
    /** True when the scan cap was reached — the totals are then a bounded read, not org truth. */
    truncated: boolean;
    scanCap: number;
};

export type FinancialPositionArgs = {
    orgId: string;
    /** The operator's own rights, resolved server-side. Never taken from a client. */
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: readonly string[];
    /** The site the operator selected, or null for org scope. */
    activeSiteLocationId?: string | null;
    /** Narrow the cohort by the date the service was delivered. */
    serviceDateFrom?: string | null;
    serviceDateTo?: string | null;
    /**
     * Narrow the cohort by WHEN THE CHARGE WAS POSTED — the moment it became owed.
     *
     * Distinct from `serviceDate` on purpose: a February charge posted in March was billed in
     * March, and "what did we bill this week" is a question about posting, not about care.
     */
    postedFromIso?: string | null;
    postedToIso?: string | null;
    scanCap?: number;
};

const EMPTY_TOTALS: FinancialPositionTotals = {
    outstandingCents: 0,
    currentlyCollectibleCents: 0,
    expectedSubsidyCents: 0,
    submittedClaimSuppressionCents: 0,
    actualSubsidyReceivedCents: 0,
    unresolvedVarianceCents: 0,
    grossChargesCents: 0,
    netChargesCents: 0,
};

export async function resolveFinancialPositionCohort(
    supabase: SupabaseClient,
    args: FinancialPositionArgs,
): Promise<FinancialPositionCohort> {
    const activeSiteLocationId = args.activeSiteLocationId?.trim() || null;
    const scanCap = Math.min(Math.max(args.scanCap ?? FINANCIAL_POSITION_SCAN_CAP, 1), FINANCIAL_POSITION_SCAN_CAP);
    const scope = { siteLocationId: activeSiteLocationId, siteScope: args.siteScope };

    /*
     * POSTED CHILDCARE CHARGES. A draft owes nothing — `computeCollectiblePosition` says so on
     * its own, but fetching drafts here would inflate every batch read for rows guaranteed to
     * contribute zero.
     */
    let chargeQuery = supabase
        .from("charges")
        .select("id, billable_source_type, billable_source_id, amount_cents, currency_code, status, service_date, posted_at")
        .eq("org_id", args.orgId)
        .eq("status", "posted")
        .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
        .order("service_date", { ascending: false, nullsFirst: false })
        .limit(scanCap);
    if (args.serviceDateFrom) chargeQuery = chargeQuery.gte("service_date", args.serviceDateFrom);
    if (args.serviceDateTo) chargeQuery = chargeQuery.lte("service_date", args.serviceDateTo);
    if (args.postedFromIso) chargeQuery = chargeQuery.gte("posted_at", args.postedFromIso);
    if (args.postedToIso) chargeQuery = chargeQuery.lte("posted_at", args.postedToIso);

    const { data: chargeRows, error } = await chargeQuery;
    if (error) throw new Error(`financial position read failed: ${error.message}`);
    const charges = ((chargeRows ?? []) as unknown) as Array<{
        id: string;
        billable_source_type: string;
        billable_source_id: string;
        amount_cents: number;
        currency_code: string;
        status: string;
        service_date: string | null;
        posted_at: string | null;
    }>;
    const truncated = charges.length >= scanCap;

    if (charges.length === 0) {
        return {
            rows: [],
            totals: { ...EMPTY_TOTALS },
            counts: {
                charges: 0,
                households: 0,
                chargesWithOutstanding: 0,
                chargesWithOpenVariance: 0,
                chargesWithUnassignedResponsibility: 0,
            },
            scope,
            truncated: false,
            scanCap,
        };
    }

    // ── PROVENANCE: each charge's OWN agreement, never the household's ──────────────────────
    const agreementIds = [
        ...new Set(
            charges.filter((c) => c.billable_source_type === "enrollment_agreement").map((c) => c.billable_source_id),
        ),
    ];
    const { data: agreementRows } = agreementIds.length
        ? await supabase
              .from("child_enrollment_agreements")
              .select("id, customer_id, site_location_id")
              .eq("org_id", args.orgId)
              .in("id", agreementIds)
        : { data: [] };
    const agreements = new Map(
        (((agreementRows ?? []) as unknown) as Array<{ id: string; customer_id: string | null; site_location_id: string | null }>)
            .map((a) => [a.id, a]),
    );

    /*
     * VISIBILITY IS DECIDED BEFORE ANY MONEY IS READ. A charge the operator may not see must not
     * reach the batch reads at all — not because it would be slower, but because a total is the
     * one place a leaked row is invisible.
     */
    const visible: Array<{
        charge: (typeof charges)[number];
        customerId: string | null;
        enrollmentAgreementId: string | null;
        locationScope: FinancialWorkLocationScope;
        siteLocationId: string | null;
    }> = [];
    for (const charge of charges) {
        const agreement = charge.billable_source_type === "enrollment_agreement"
            ? agreements.get(charge.billable_source_id) ?? null
            : null;
        const location = resolveFinancialWorkLocation({
            billableSourceType: charge.billable_source_type,
            agreementSiteLocationId: agreement?.site_location_id ?? null,
        });
        if (!location) continue;
        if (
            !isFinancialWorkVisible({
                location,
                siteScope: args.siteScope,
                allowedSiteLocationIds: args.allowedSiteLocationIds,
                activeSiteLocationId,
            })
        ) {
            continue;
        }
        visible.push({
            charge,
            customerId: charge.billable_source_type === "customer"
                ? charge.billable_source_id
                : agreement?.customer_id ?? null,
            enrollmentAgreementId: charge.billable_source_type === "enrollment_agreement"
                ? charge.billable_source_id
                : null,
            locationScope: location.scope,
            siteLocationId: location.siteLocationId,
        });
    }

    if (visible.length === 0) {
        return {
            rows: [],
            totals: { ...EMPTY_TOTALS },
            counts: {
                charges: 0,
                households: 0,
                chargesWithOutstanding: 0,
                chargesWithOpenVariance: 0,
                chargesWithUnassignedResponsibility: 0,
            },
            scope,
            truncated,
            scanCap,
        };
    }

    const chargeIds = visible.map((v) => v.charge.id);
    const facts = await readPositionFacts(supabase, args.orgId, chargeIds);

    /* Names, so a list of accounts reads as families. Presentation only — never a key. */
    const customerIds = [...new Set(visible.map((v) => v.customerId).filter((v): v is string => !!v))];
    const { data: customerRows } = customerIds.length
        ? await supabase.from("customers").select("id, name").eq("org_id", args.orgId).in("id", customerIds)
        : { data: [] };
    const customerNames = new Map(
        (((customerRows ?? []) as unknown) as Array<{ id: string; name: string | null }>).map((c) => [c.id, c.name]),
    );

    const rows: FinancialPositionRow[] = visible.map((v) => {
        const reductions = facts.reductionsByCharge.get(v.charge.id) ?? [];
        const reductionsCents = reductions.reduce((acc, r) => acc + r, 0);
        const grossCents = Number(v.charge.amount_cents);
        const netCents = grossCents + reductionsCents;
        const allocations = facts.allocationsByCharge.get(v.charge.id) ?? [];

        const position = computeCollectiblePosition({
            chargeId: v.charge.id,
            currencyCode: v.charge.currency_code,
            chargeStatus: v.charge.status,
            grossCents,
            reductionsCents,
            netCents,
            applications: facts.applicationsByCharge.get(v.charge.id) ?? [],
            allocations: allocations.map((a) => ({
                assignedAmountCents: a.assignedAmountCents,
                isUnassigned: a.isUnassigned,
            })),
            expectedFunding: facts.fundingForCharge(allocations),
            claimLines: facts.claimLinesByCharge.get(v.charge.id) ?? [],
            variances: facts.variancesByCharge.get(v.charge.id) ?? [],
        });

        return {
            position,
            customerId: v.customerId,
            householdName: v.customerId ? customerNames.get(v.customerId) ?? null : null,
            enrollmentAgreementId: v.enrollmentAgreementId,
            serviceDate: v.charge.service_date,
            postedAt: v.charge.posted_at,
            periodKey: v.charge.service_date ? v.charge.service_date.slice(0, 7) : null,
            locationScope: v.locationScope,
            siteLocationId: v.siteLocationId,
        };
    });

    const totals = rows.reduce<FinancialPositionTotals>((acc, r) => {
        const p = r.position;
        acc.outstandingCents += p.outstandingCents;
        acc.currentlyCollectibleCents += p.currentlyCollectibleCents;
        acc.expectedSubsidyCents += p.expectedSubsidyCents;
        acc.submittedClaimSuppressionCents += p.submittedClaimSuppressionCents;
        acc.actualSubsidyReceivedCents += p.actualSubsidyReceivedCents;
        acc.unresolvedVarianceCents += p.unresolvedVarianceCents;
        acc.grossChargesCents += p.explanation.grossCents;
        acc.netChargesCents += p.explanation.netCents;
        return acc;
    }, { ...EMPTY_TOTALS });

    return {
        rows,
        totals,
        counts: {
            charges: rows.length,
            households: new Set(rows.map((r) => r.customerId).filter(Boolean)).size,
            chargesWithOutstanding: rows.filter((r) => r.position.outstandingCents > 0).length,
            chargesWithOpenVariance: rows.filter((r) => r.position.explanation.openVarianceStates.length > 0).length,
            chargesWithUnassignedResponsibility: rows.filter((r) => r.position.unassignedResponsibilityCents > 0).length,
        },
        scope,
        truncated,
        scanCap,
    };
}

type AllocationFact = { id: string; assignedAmountCents: number; isUnassigned: boolean; shareId: string | null };

/**
 * Every fact the arithmetic needs, read once per table rather than once per charge.
 *
 * The queries are the same queries `resolveFamilyCollectible` issues, with `.eq(charge)`
 * widened to `.in(charges)`. Keeping them recognisably identical is deliberate: a divergence
 * here would be a divergence in what the workspace believes about money.
 */
/**
 * ── A COHORT READ THAT FAILED SILENTLY BECAME MONEY A FAMILY DID NOT OWE ────────────────────────
 *
 * THE DEFECT. Every fact below was fetched with one `.in("charge_id", chargeIds)` covering the
 * whole cohort, and the result was destructured as `const { data } = …` with the error dropped.
 * Past a few hundred charges the request URI exceeds the server's limit, PostgREST answers
 * `URI too long`, and `data` comes back null. Null applications do not read as "we could not
 * find out" — they read as "nothing was ever paid", so every account's outstanding was overstated
 * by exactly the payments applied to it. A household that had settled in full was shown owing the
 * whole charge. That is worse than an empty list: it is a confident wrong number, and Thread 2's
 * account detail sitting beside it answered zero for the same charge.
 *
 * THE REPAIR, in two halves, because either alone still lies:
 *
 *   1. CHUNK. The id list is spent in batches small enough that the URI cannot overflow, and the
 *      batches are concatenated. Scale stops changing the answer.
 *   2. THROW. A read that fails is an ERROR, never an empty result. Financial truth may be
 *      unavailable, but it may not be silently replaced by a cheaper falsehood — the same
 *      fail-closed rule `resolveActorPermissionGrants` already applies to grants.
 *
 * `resolveFamilyCollectible` issues these same queries with `.eq(charge)` and was therefore never
 * exposed: one id per request. That is exactly the divergence the note above this function warned
 * about, arriving through scale rather than through edits.
 */
const CHARGE_ID_BATCH = 80;

async function readChargeScoped<T>(
    label: string,
    chargeIds: string[],
    run: (batch: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < chargeIds.length; i += CHARGE_ID_BATCH) {
        const batch = chargeIds.slice(i, i + CHARGE_ID_BATCH);
        const { data, error } = await run(batch);
        if (error) {
            throw new Error(`financial position: ${label} could not be read (${error.message.trim()})`);
        }
        for (const row of data ?? []) out.push(row);
    }
    return out;
}

async function readPositionFacts(supabase: SupabaseClient, orgId: string, chargeIds: string[]) {
    const [
        reductionRows,
        applicationRows,
        allocationRows,
        claimLineRows,
    ] = await Promise.all([
        readChargeScoped<{ source_charge_id: string; amount_cents: number }>(
            "reductions",
            chargeIds,
            (batch) =>
                supabase
                    .from("financial_reduction_applications")
                    .select("source_charge_id, amount_cents")
                    .eq("org_id", orgId)
                    .in("source_charge_id", batch),
        ),
        readChargeScoped<{ charge_id: string; allocated_amount_cents: number; status: string | null; payment_id: string }>(
            "payment applications",
            chargeIds,
            (batch) =>
                supabase
                    .from("payment_allocations")
                    .select("charge_id, allocated_amount_cents, status, payment_id")
                    .eq("org_id", orgId)
                    .in("charge_id", batch),
        ),
        readChargeScoped<{ id: string; charge_id: string; assigned_amount_cents: number; is_unassigned: boolean; share_id: string | null }>(
            "responsibility allocations",
            chargeIds,
            (batch) =>
                supabase
                    .from("financial_responsibility_allocations")
                    .select("id, charge_id, assigned_amount_cents, is_unassigned, share_id")
                    .eq("org_id", orgId)
                    .eq("state", "active")
                    .in("charge_id", batch),
        ),
        readChargeScoped<{ id: string; charge_id: string; claim_id: string; claimed_amount_cents: number }>(
            "subsidy claim lines",
            chargeIds,
            (batch) =>
                supabase
                    .from("financial_subsidy_claim_lines")
                    .select("id, charge_id, claim_id, claimed_amount_cents")
                    .eq("org_id", orgId)
                    .in("charge_id", batch),
        ),
    ]);

    const reductionsByCharge = new Map<string, number[]>();
    for (const r of ((reductionRows ?? []) as Array<{ source_charge_id: string; amount_cents: number }>)) {
        const list = reductionsByCharge.get(r.source_charge_id) ?? [];
        list.push(Number(r.amount_cents));
        reductionsByCharge.set(r.source_charge_id, list);
    }

    const rawApplications = ((applicationRows ?? []) as Array<{
        charge_id: string;
        allocated_amount_cents: number;
        status: string | null;
        payment_id: string;
    }>);
    const paymentIds = [...new Set(rawApplications.map((a) => a.payment_id).filter(Boolean))];
    const { data: paymentRows } = paymentIds.length
        ? await supabase
              .from("payments")
              .select("id, status, payer_entity_type")
              .eq("org_id", orgId)
              .in("id", paymentIds)
        : { data: [] };
    const payments = new Map(
        ((paymentRows ?? []) as Array<{ id: string; status: string; payer_entity_type: string | null }>)
            .map((p) => [p.id, p]),
    );
    const applicationsByCharge = new Map<string, Array<{
        allocatedAmountCents: number;
        status: string | null;
        paymentStatus: string | null;
        payerEntityType: string | null;
    }>>();
    for (const a of rawApplications) {
        const payment = payments.get(a.payment_id);
        const list = applicationsByCharge.get(a.charge_id) ?? [];
        list.push({
            allocatedAmountCents: Number(a.allocated_amount_cents) || 0,
            status: a.status ?? "active",
            paymentStatus: payment?.status ?? null,
            payerEntityType: payment?.payer_entity_type ?? null,
        });
        applicationsByCharge.set(a.charge_id, list);
    }

    const allocationsByCharge = new Map<string, AllocationFact[]>();
    for (const a of ((allocationRows ?? []) as Array<{
        id: string;
        charge_id: string;
        assigned_amount_cents: number;
        is_unassigned: boolean;
        share_id: string | null;
    }>)) {
        const list = allocationsByCharge.get(a.charge_id) ?? [];
        list.push({
            id: a.id,
            assignedAmountCents: Number(a.assigned_amount_cents),
            isUnassigned: a.is_unassigned,
            shareId: a.share_id,
        });
        allocationsByCharge.set(a.charge_id, list);
    }

    /* Expected funding hangs off BOTH anchors a claim reads: the allocation, or the share. */
    const allocationIds = [...allocationsByCharge.values()].flat().map((a) => a.id);
    const shareIds = [
        ...new Set([...allocationsByCharge.values()].flat().map((a) => a.shareId).filter((v): v is string => !!v)),
    ];
    const [{ data: fundingByAllocationRows }, { data: fundingByShareRows }] = await Promise.all([
        allocationIds.length
            ? supabase
                  .from("financial_expected_funding")
                  .select("expected_amount_cents, percent_basis_points, basis, allocation_id, share_id")
                  .eq("org_id", orgId).eq("state", "active").in("allocation_id", allocationIds)
            : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        shareIds.length
            ? supabase
                  .from("financial_expected_funding")
                  .select("expected_amount_cents, percent_basis_points, basis, allocation_id, share_id")
                  .eq("org_id", orgId).eq("state", "active").is("allocation_id", null).in("share_id", shareIds)
            : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);
    const fundingRow = (f: Record<string, unknown>) => ({
        basis: (f.basis as string | null) ?? null,
        expectedAmountCents: f.expected_amount_cents == null ? null : Number(f.expected_amount_cents),
        percentBasisPoints: f.percent_basis_points == null ? null : Number(f.percent_basis_points),
    });
    const fundingByAllocationId = new Map<string, ReturnType<typeof fundingRow>[]>();
    for (const f of ((fundingByAllocationRows ?? []) as Array<Record<string, unknown>>)) {
        const key = String(f.allocation_id);
        const list = fundingByAllocationId.get(key) ?? [];
        list.push(fundingRow(f));
        fundingByAllocationId.set(key, list);
    }
    const fundingByShareId = new Map<string, ReturnType<typeof fundingRow>[]>();
    for (const f of ((fundingByShareRows ?? []) as Array<Record<string, unknown>>)) {
        const key = String(f.share_id);
        const list = fundingByShareId.get(key) ?? [];
        list.push(fundingRow(f));
        fundingByShareId.set(key, list);
    }

    const rawClaimLines = ((claimLineRows ?? []) as Array<{
        id: string;
        charge_id: string;
        claim_id: string;
        claimed_amount_cents: number;
    }>);
    const claimIds = [...new Set(rawClaimLines.map((l) => l.claim_id))];
    const lineIds = rawClaimLines.map((l) => l.id);
    const [{ data: claimRows }, { data: varianceRows }] = await Promise.all([
        claimIds.length
            ? supabase.from("financial_subsidy_claims").select("id, state").eq("org_id", orgId).in("id", claimIds)
            : Promise.resolve({ data: [] as Array<{ id: string; state: string }> }),
        lineIds.length
            ? supabase
                  .from("financial_subsidy_variances")
                  .select("claim_line_id, variance_cents, state, resolution_kind")
                  .eq("org_id", orgId)
                  .in("claim_line_id", lineIds)
            : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);
    const claimStateById = new Map(
        ((claimRows ?? []) as Array<{ id: string; state: string }>).map((c) => [c.id, c.state]),
    );
    const chargeIdByLineId = new Map(rawClaimLines.map((l) => [l.id, l.charge_id]));

    const claimLinesByCharge = new Map<string, Array<{ claimId: string; claimedAmountCents: number; claimState: string | null }>>();
    for (const l of rawClaimLines) {
        const list = claimLinesByCharge.get(l.charge_id) ?? [];
        list.push({
            claimId: l.claim_id,
            claimedAmountCents: Number(l.claimed_amount_cents),
            claimState: claimStateById.get(l.claim_id) ?? null,
        });
        claimLinesByCharge.set(l.charge_id, list);
    }

    const variancesByCharge = new Map<string, Array<{ varianceCents: number; state: string; resolutionKind: string | null }>>();
    for (const v of ((varianceRows ?? []) as Array<Record<string, unknown>>)) {
        const chargeId = chargeIdByLineId.get(String(v.claim_line_id));
        if (!chargeId) continue;
        const list = variancesByCharge.get(chargeId) ?? [];
        list.push({
            varianceCents: Number(v.variance_cents),
            state: String(v.state),
            resolutionKind: (v.resolution_kind as string | null) ?? null,
        });
        variancesByCharge.set(chargeId, list);
    }

    return {
        reductionsByCharge,
        applicationsByCharge,
        allocationsByCharge,
        claimLinesByCharge,
        variancesByCharge,
        /*
         * THE SHARE IS DEDUPED PER CHARGE, NOT PER ALLOCATION.
         *
         * `resolveFamilyCollectible` reads share-anchored funding with ONE query over the
         * charge's distinct share ids, so a charge whose two parties hang off the same share
         * counts that funding once. Fanning out per allocation instead would count it twice
         * and quietly raise expected subsidy for exactly the families that have two payers.
         */
        fundingForCharge(allocations: readonly AllocationFact[]) {
            const direct = allocations.flatMap((a) => fundingByAllocationId.get(a.id) ?? []);
            const shareKeys = [...new Set(allocations.map((a) => a.shareId).filter((v): v is string => !!v))];
            const viaShare = shareKeys.flatMap((key) => fundingByShareId.get(key) ?? []);
            return [...direct, ...viaShare];
        },
    };
}

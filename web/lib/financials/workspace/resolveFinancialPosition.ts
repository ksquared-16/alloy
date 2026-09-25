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
    /*
     * WHICH CHILD THIS OBLIGATION IS ABOUT, or null when it is genuinely the household's.
     *
     * The charge already knows: an `enrollment_agreement` source carries the agreement's
     * `customer_member_id`, and a `customer` source is childless BY CONSTRUCTION — a registration
     * fee belongs to the family, not to one of its children. Every other financial reader keeps
     * that distinction (draft resolution, responsibility, both reduction paths, and the card's own
     * per-child reconciliation); only this cohort dropped it, by selecting the agreement's
     * household and site and not its child. So a two-child family arrived at Accounts as one
     * undifferentiated balance.
     *
     * Null here means household-level and is never a missing value to be filled in later. Nothing
     * infers a child from household membership: a household charge has no child to name, and
     * naming one would be an invention the rest of the spine would then have to honour.
     */
    customerMemberId: string | null;
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
    /*
     * ── SAY WHERE THE COHORT'S TIME GOES ───────────────────────────────────────────────────────
     *
     * This branch is 650-960ms of the Accounts list's wait and reports one opaque `cohort` label.
     * Its sibling, the subjects cohort, was the same shape until it was given an interior — and
     * two repairs made against the opaque version moved nothing, because reading the code said
     * what COULD be parallel and not what was expensive. Same instrument, same reason.
     */
    mark?: (name: string) => void,
): Promise<FinancialPositionCohort> {
    const phase = (name: string) => mark?.(name);
    const activeSiteLocationId = args.activeSiteLocationId?.trim() || null;
    const scanCap = Math.min(Math.max(args.scanCap ?? FINANCIAL_POSITION_SCAN_CAP, 1), FINANCIAL_POSITION_SCAN_CAP);
    const scope = { siteLocationId: activeSiteLocationId, siteScope: args.siteScope };

    /*
     * POSTED CHILDCARE CHARGES. A draft owes nothing — `computeCollectiblePosition` says so on
     * its own, but fetching drafts here would inflate every batch read for rows guaranteed to
     * contribute zero.
     */
    /*
     * ── THE CAP THAT IS NOT OURS ────────────────────────────────────────────────────────────────
     *
     * `.limit(scanCap)` asks for up to 2,000 charges. PostgREST answers at most `db-max-rows`, and
     * on this deployment that is 1,000 — silently. No error, no header anyone read: the query says
     * 2,000, the server returns 1,000, and the code below treats the truncated page as the whole
     * cohort. `truncated` then says false, because 1,000 is not >= 2,000.
     *
     * Measured, not theorised: 1,228 posted charges in the certification tenant, 1,000 rows read,
     * 806 rows in the cohort after visibility — and the four demo households, whose service dates
     * are older than the flood another lane had just generated, were ABSENT from Accounts and
     * Charges altogether. A family who owes money had simply stopped existing on the surface an
     * operator looks them up on. This is the Thread 4B defect wearing different clothes: a read
     * that loses rows quietly is worse than one that fails, because nothing on screen says so.
     *
     * So the page size is stated here rather than assumed away, and pages are requested by
     * `.range()` until the cohort is complete or the scan cap is genuinely reached. `truncated` now
     * means what it says: there is more posted money than this cohort was allowed to carry.
     *
     * The order is (service_date desc, id) — the id is not decoration. Paging by range over a
     * non-unique sort key can repeat or skip rows across page boundaries when many charges share a
     * service date, which is exactly what a month of generated tuition looks like.
     */
    type PositionChargeRow = {
        id: string;
        billable_source_type: string;
        billable_source_id: string;
        amount_cents: number;
        currency_code: string;
        status: string;
        service_date: string | null;
        posted_at: string | null;
    };
    /*
     * ONE PAGING PRIMITIVE, shared with the account card.
     *
     * This loop was written here first and the Focus Panel card did not have one, which is how the
     * two surfaces came to disagree about the same family. `readAllPages` is that loop, named and
     * exported, so the workspace and the card page the same way by construction rather than by two
     * people remembering the same thing.
     */
    const { rows: charges, truncated } = await readAllPages<PositionChargeRow>(
        "financial position charges",
        scanCap,
        (fromIndex, toIndex) => {
            let chargeQuery = supabase
                .from("charges")
                .select("id, billable_source_type, billable_source_id, amount_cents, currency_code, status, service_date, posted_at")
                .eq("org_id", args.orgId)
                .eq("status", "posted")
                .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
                .order("service_date", { ascending: false, nullsFirst: false })
                .order("id", { ascending: true });
            if (args.serviceDateFrom) chargeQuery = chargeQuery.gte("service_date", args.serviceDateFrom);
            if (args.serviceDateTo) chargeQuery = chargeQuery.lte("service_date", args.serviceDateTo);
            if (args.postedFromIso) chargeQuery = chargeQuery.gte("posted_at", args.postedFromIso);
            if (args.postedToIso) chargeQuery = chargeQuery.lte("posted_at", args.postedToIso);
            return chargeQuery.range(fromIndex, toIndex) as never;
        },
    );

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
    /*
     * PROVENANCE FAILS CLOSED TOO. This read decides which household a charge belongs to. Dropped,
     * it does not produce a wrong number — it produces no account at all, which is indistinguishable
     * on screen from a family that has no financial history.
     */
    phase("charges");
    const agreementRows = await readInBatches<{
        id: string;
        customer_id: string | null;
        customer_member_id: string | null;
        site_location_id: string | null;
    }>(
        "the agreements charges were billed from",
        agreementIds,
        (batch) =>
            supabase
                .from("child_enrollment_agreements")
                .select("id, customer_id, customer_member_id, site_location_id")
                .eq("org_id", args.orgId)
                .in("id", batch),
    );
    const agreements = new Map(
        agreementRows
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
        customerMemberId: string | null;
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
            // A household source has no child, and does not borrow one from the family.
            customerMemberId: charge.billable_source_type === "enrollment_agreement"
                ? agreement?.customer_member_id ?? null
                : null,
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

    phase("agreements");
    /* One reader for both callers — see `resolveCollectiblePositionsForCharges`. */
    const positionsByCharge = await resolveCollectiblePositionsForCharges(supabase, {
        orgId: args.orgId,
        charges: visible.map((v) => ({
            id: v.charge.id,
            currencyCode: v.charge.currency_code,
            status: v.charge.status,
            amountCents: Number(v.charge.amount_cents),
        })),
    });

    /* Names, so a list of accounts reads as families. Presentation only — never a key. */
    const customerIds = [...new Set(visible.map((v) => v.customerId).filter((v): v is string => !!v))];
    phase("collectible");
    const customerRows = await readInBatches<{ id: string; name: string | null }>(
        "household names",
        customerIds,
        (batch) => supabase.from("customers").select("id, name").eq("org_id", args.orgId).in("id", batch),
    );
    const customerNames = new Map(customerRows.map((c) => [c.id, c.name]));
    phase("customers");

    const rows: FinancialPositionRow[] = visible.map((v) => {
        /*
         * The position is the shared reader's, not a second computation. A charge the reader could
         * not speak for is impossible here: it was given exactly these ids.
         */
        const position = positionsByCharge.get(v.charge.id)!;
        return {
            position,
            customerId: v.customerId,
            customerMemberId: v.customerMemberId,
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
/**
 * How many identifiers one request may carry. Well under the server's URI limit with room for the
 * longest column list in this file, so the bound holds as selects grow rather than only today.
 */
export const ID_BATCH = 80;

/**
 * THE OTHER CEILING — the one that has no id list to blame.
 *
 * `readInBatches` solves the URI length problem: too many identifiers in one request. It does
 * nothing about the second, quieter bound, because that one is not about the request at all.
 * PostgREST answers at most `db-max-rows` rows to ANY single query, and on this deployment that is
 * 1,000. A read whose COHORT is large — every charge on a long-lived account, every receipt an
 * organisation has taken — is therefore answered with a page and no indication that it was one.
 * No error, no header anyone read: the caller treats the page as the whole truth and computes a
 * balance from part of a ledger.
 *
 * Measured on the certification tenant: an account holding 2,821 charges answered an unpaged read
 * with exactly 1,000 of them, and the Focus Panel card and the Financials Workspace then disagreed
 * about the same family's money — because only one of them paged.
 *
 * So the cohort is requested by `.range()` until it is complete or an EXPLICIT cap is reached, and
 * the caller is told which happened. `truncated` means what it says: there is more than this scan
 * was allowed to carry. What a caller must never receive is a short answer that looks whole.
 *
 * TWO RULES FOR CALLERS:
 *
 *   ORDER TOTALLY. Paging by range over a non-unique sort key can repeat or skip rows across page
 *   boundaries. Every caller ends its order with a unique column — `id` — so the sequence is a
 *   sequence and not a suggestion.
 *
 *   DECIDE WHAT TRUNCATION MEANS. An operational scan across an organisation may legitimately
 *   report "there is more" (the workspace does). A single account's BALANCE may not: a number
 *   computed from part of a ledger is wrong, not partial, so the account read fails visibly
 *   instead.
 */
export const POSTGREST_MAX_ROWS = 1000;

export async function readAllPages<T>(
    label: string,
    scanCap: number,
    page: (fromIndex: number, toIndex: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; truncated: boolean }> {
    const rows: T[] = [];
    let reachedEnd = false;
    while (rows.length < scanCap) {
        const want = Math.min(POSTGREST_MAX_ROWS, scanCap - rows.length);
        const { data, error } = await page(rows.length, rows.length + want - 1);
        // Same rule as `readInBatches`: a read that fails is an error, never a cheaper falsehood.
        if (error) throw new Error(`${label} could not be read (${error.message.trim()})`);
        const batch = (data ?? []) as T[];
        for (const row of batch) rows.push(row);
        /* A short page is the end of the cohort. A full one may not be. */
        if (batch.length < want) {
            reachedEnd = true;
            break;
        }
    }
    /*
     * Honest truncation: true only when the cap was actually reached AND the read did not run out
     * of rows first, so a cohort of exactly `scanCap` is not reported as incomplete.
     */
    return { rows, truncated: !reachedEnd && rows.length >= scanCap };
}

/*
 * NOT ONLY THE CHARGE-SCOPED FACTS. The first repair batched the four facts keyed by charge and
 * left the follow-on read keyed by PAYMENT alone, because it looked small — it reads only the
 * payments the applications referred to. It is not small: 432 applications on this tenant refer to
 * 392 distinct payments, the request URI overflows exactly as before, and the discarded error left
 * every application with a null payment status. An application whose payment cannot be shown to
 * have settled is not counted, so every account read as owing its full posted amount and NO
 * account could ever be settled. Same rule, same file, one read further down.
 */
export async function readInBatches<T>(
    label: string,
    ids: string[],
    run: (batch: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
    /*
     * De-duplicated once, here, so a repeated identifier cannot straddle two batches and return the
     * same row twice — which in this file would be counted twice as money. Callers that already
     * pass a Set lose nothing; callers that do not are made safe rather than trusted.
     */
    const unique = [...new Set(ids)];
    const out: T[] = [];
    for (let i = 0; i < unique.length; i += ID_BATCH) {
        const batch = unique.slice(i, i + ID_BATCH);
        const { data, error } = await run(batch);
        if (error) {
            throw new Error(`financial position: ${label} could not be read (${error.message.trim()})`);
        }
        for (const row of data ?? []) out.push(row);
    }
    return out;
}

/**
 * COLLECTIBLE POSITIONS FOR A KNOWN SET OF CHARGES, read once per table.
 *
 * ── WHY THIS IS EXPORTED ──
 *
 * `resolveFamilyCollectible` answers the same question with `.eq(charge)` — one round trip per
 * charge, and roughly six of them. The account card looped it over every posted charge in the
 * period, which on the Certhouse specimen is 49 charges and therefore ~294 database round trips.
 * Measured through Server-Timing on deployed staging: `collectible;dur=2841.7` of a `total;dur=3755.1`
 * response — 76% of the wait, and O(posted rows).
 *
 * The note above `readPositionFacts` already named that divergence as a risk. This is the other
 * half of the repair: the cohort scan and the single account now reach the SAME set-based reader
 * and the SAME `computeCollectiblePosition`, so there is one implementation rather than two that
 * must be kept in agreement. The cohort's own mapper below calls this too.
 *
 * The caller supplies the charge facts it already holds — gross, status, currency — because a
 * caller that has read the charges must not read them again to be told what it already knows.
 */
export async function resolveCollectiblePositionsForCharges(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        /**
         * The charge facts, when the caller has already read them — the cohort scan has. A caller
         * that only holds ids passes `chargeIds` instead and the charges are read here, ONCE, from
         * the same table `resolveAllocatableNet` reads per charge. Gross, status and currency are
         * never inferred from a projection: they decide money.
         */
        charges?: ReadonlyArray<{ id: string; currencyCode: string; status: string; amountCents: number }>;
        chargeIds?: readonly string[];
        /**
         * The position facts, already gathered. The card passes the account fact bundle, so the
         * two dependent waves this function used to spend are already paid for by the time it is
         * called. The arithmetic below is unchanged and still the only authority on a position.
         */
        facts?: PositionFactRows;
    },
): Promise<Map<string, CollectiblePosition>> {
    const out = new Map<string, CollectiblePosition>();
    /*
     * THE FACTS DO NOT WAIT ON THE CHARGE ROWS.
     *
     * A caller that passed `chargeIds` has already named every id, so the cohort's fact reads
     * start immediately rather than after the charges come back — two independent questions asked
     * at once. A caller that passed `facts` has already paid for them in one round trip and starts
     * nothing here at all.
     */
    const supplied = args.facts ? shapePositionFacts(args.facts) : null;
    const knownIds = args.charges?.map((c) => c.id) ?? [...(args.chargeIds ?? [])];
    const factRowsP = supplied || !knownIds.length
        ? null
        : readPositionFactRows(supabase, args.orgId, knownIds);
    const charges =
        args.charges
        ?? (args.chargeIds?.length
            ? (
                  await readInBatches<{ id: string; amount_cents: number; currency_code: string; status: string }>(
                      "charges",
                      [...args.chargeIds],
                      (batch) =>
                          supabase
                              .from("charges")
                              .select("id, amount_cents, currency_code, status")
                              .eq("org_id", args.orgId)
                              .in("id", batch),
                  )
              ).map((c) => ({
                  id: c.id,
                  currencyCode: c.currency_code,
                  status: c.status,
                  amountCents: Number(c.amount_cents),
              }))
            : []);
    if (charges.length === 0) return out;
    const facts =
        supplied
        ?? shapePositionFacts(await (factRowsP ?? readPositionFactRows(supabase, args.orgId, charges.map((c) => c.id))));
    for (const charge of charges) {
        const reductions = facts.reductionsByCharge.get(charge.id) ?? [];
        const reductionsCents = reductions.reduce((acc, r) => acc + r, 0);
        const grossCents = Number(charge.amountCents);
        const allocations = facts.allocationsByCharge.get(charge.id) ?? [];
        out.set(
            charge.id,
            computeCollectiblePosition({
                chargeId: charge.id,
                currencyCode: charge.currencyCode,
                chargeStatus: charge.status,
                grossCents,
                reductionsCents,
                netCents: grossCents + reductionsCents,
                applications: facts.applicationsByCharge.get(charge.id) ?? [],
                allocations: allocations.map((a) => ({
                    assignedAmountCents: a.assignedAmountCents,
                    isUnassigned: a.isUnassigned,
                })),
                expectedFunding: facts.fundingForCharge(allocations),
                claimLines: facts.claimLinesByCharge.get(charge.id) ?? [],
                variances: facts.variancesByCharge.get(charge.id) ?? [],
            }),
        );
    }
    return out;
}

/**
 * THE COHORT'S ACQUISITION — many accounts at once, so the account bundle does not fit.
 *
 * The Details card asks about ONE account and gets its facts in a single round trip from
 * `financials_account_fact_bundle`. The workspace cohort asks about many accounts in one scan,
 * which is a different question, so it still reads set-wise here. That is not two answers to one
 * question: both hand their rows to the SAME `shapePositionFacts`, which is where the economic
 * meaning lives, and neither computes a position of its own.
 */
export async function readPositionFactRows(
    supabase: SupabaseClient,
    orgId: string,
    chargeIds: string[],
): Promise<PositionFactRows> {
    const [reductions, applications, responsibilityAllocations, claimLines] = await Promise.all([
        readInBatches<{ source_charge_id: string; amount_cents: number }>(
            "reductions", chargeIds,
            (batch) => supabase.from("financial_reduction_applications")
                .select("source_charge_id, amount_cents").eq("org_id", orgId).in("source_charge_id", batch),
        ),
        readInBatches<{ charge_id: string; allocated_amount_cents: number; status: string | null; payment_id: string }>(
            "payment applications", chargeIds,
            (batch) => supabase.from("payment_allocations")
                .select("charge_id, allocated_amount_cents, status, payment_id").eq("org_id", orgId).in("charge_id", batch),
        ),
        readInBatches<{ id: string; charge_id: string; assigned_amount_cents: number; is_unassigned: boolean; share_id: string | null }>(
            "responsibility allocations", chargeIds,
            (batch) => supabase.from("financial_responsibility_allocations")
                .select("id, charge_id, assigned_amount_cents, is_unassigned, share_id")
                .eq("org_id", orgId).eq("state", "active").in("charge_id", batch),
        ),
        readInBatches<{ id: string; charge_id: string; claim_id: string; claimed_amount_cents: number }>(
            "subsidy claim lines", chargeIds,
            (batch) => supabase.from("financial_subsidy_claim_lines")
                .select("id, charge_id, claim_id, claimed_amount_cents").eq("org_id", orgId).in("charge_id", batch),
        ),
    ]);

    /* Everything the first round unlocks goes out together: none of these needs another's rows. */
    const paymentIds = [...new Set(applications.map((a) => a.payment_id).filter(Boolean))];
    const allocationIds = responsibilityAllocations.map((a) => a.id);
    const shareIds = [...new Set(responsibilityAllocations.map((a) => a.share_id).filter((v): v is string => !!v))];
    const claimIds = [...new Set(claimLines.map((l) => l.claim_id))];
    const lineIds = claimLines.map((l) => l.id);
    const [paymentsBacking, { data: fundingByAllocation }, { data: fundingByShare }, { data: claims }, { data: variances }] =
        await Promise.all([
            readInBatches<{ id: string; status: string; payer_entity_type: string | null }>(
                "payments backing applied money", paymentIds,
                (batch) => supabase.from("payments")
                    .select("id, status, payer_entity_type").eq("org_id", orgId).in("id", batch),
            ),
            allocationIds.length
                ? supabase.from("financial_expected_funding")
                      .select("expected_amount_cents, percent_basis_points, basis, allocation_id, share_id")
                      .eq("org_id", orgId).eq("state", "active").in("allocation_id", allocationIds)
                : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
            shareIds.length
                ? supabase.from("financial_expected_funding")
                      .select("expected_amount_cents, percent_basis_points, basis, allocation_id, share_id")
                      .eq("org_id", orgId).eq("state", "active").is("allocation_id", null).in("share_id", shareIds)
                : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
            claimIds.length
                ? supabase.from("financial_subsidy_claims").select("id, state").eq("org_id", orgId).in("id", claimIds)
                : Promise.resolve({ data: [] as Array<{ id: string; state: string }> }),
            lineIds.length
                ? supabase.from("financial_subsidy_variances")
                      .select("claim_line_id, variance_cents, state, resolution_kind")
                      .eq("org_id", orgId).in("claim_line_id", lineIds)
                : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        ]);

    return {
        reductions, applications, responsibilityAllocations, claimLines, paymentsBacking,
        fundingByAllocation: (fundingByAllocation ?? []) as Array<Record<string, unknown>>,
        fundingByShare: (fundingByShare ?? []) as Array<Record<string, unknown>>,
        claims: (claims ?? []) as Array<{ id: string; state: string }>,
        variances: (variances ?? []) as Array<Record<string, unknown>>,
    };
}

/**
 * THE ROWS A POSITION IS COMPUTED FROM, however they were acquired.
 *
 * This read AND shaped in one function, which tied the economic meaning of these facts to one
 * transport. The shaping is the half that decides money — which applications count, how share
 * funding is deduped per charge, what a variance attaches to — and it must exist exactly once.
 *
 * So it lives here, over rows the caller supplies. Production supplies them from
 * `financials_account_fact_bundle`: one round trip in place of the two dependent waves this used
 * to spend. The waved read survives only inside the parity oracle, as the comparison it is.
 */
export type PositionFactRows = {
    reductions: ReadonlyArray<{ source_charge_id: string; amount_cents: number }>;
    applications: ReadonlyArray<{ charge_id: string; allocated_amount_cents: number; status: string | null; payment_id: string }>;
    responsibilityAllocations: ReadonlyArray<{ id: string; charge_id: string; assigned_amount_cents: number; is_unassigned: boolean; share_id: string | null }>;
    claimLines: ReadonlyArray<{ id: string; charge_id: string; claim_id: string; claimed_amount_cents: number }>;
    paymentsBacking: ReadonlyArray<{ id: string; status: string; payer_entity_type: string | null }>;
    fundingByAllocation: ReadonlyArray<Record<string, unknown>>;
    fundingByShare: ReadonlyArray<Record<string, unknown>>;
    claims: ReadonlyArray<{ id: string; state: string }>;
    variances: ReadonlyArray<Record<string, unknown>>;
};

export function shapePositionFacts(rows: PositionFactRows) {
    const reductionRows = rows.reductions;
    const applicationRows = rows.applications;
    const allocationRows = rows.responsibilityAllocations;
    const claimLineRows = rows.claimLines;

    const reductionsByCharge = new Map<string, number[]>();
    for (const r of ((reductionRows ?? []) as Array<{ source_charge_id: string; amount_cents: number }>)) {
        const list = reductionsByCharge.get(r.source_charge_id) ?? [];
        list.push(Number(r.amount_cents));
        reductionsByCharge.set(r.source_charge_id, list);
    }

    /*
     * ── EVERYTHING ROUND ONE UNLOCKS GOES OUT TOGETHER ───────────────────────────────────────
     *
     * Payments, expected funding and the subsidy claim/variance pair each need ids that the four
     * reads above produced, and NONE of them needs anything the other two return: payments are
     * keyed by `payment_id` off the allocations, funding by `allocation_id`/`share_id` off the
     * responsibility allocations, claims and variances by ids off the claim lines. They ran as
     * three consecutive awaits purely because each sat where its rows were first consumed — the
     * same source-order-as-dependency mistake the card's own builder had.
     *
     * Measured on deployed staging through Server-Timing, `collectible;dur=` was 1,414–1,997 ms of
     * a 2,677–3,446 ms response, the single largest span left after the per-charge N+1 came out.
     * Four serial rounds become two. The ids are derived first, from round one's rows only, so the
     * keys are computed rather than the reads reordered: same queries, same predicates, same rows.
     */
    const rawApplications = ((applicationRows ?? []) as Array<{
        charge_id: string;
        allocated_amount_cents: number;
        status: string | null;
        payment_id: string;
    }>);
    const paymentIds = [...new Set(rawApplications.map((a) => a.payment_id).filter(Boolean))];

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

    const rawClaimLines = ((claimLineRows ?? []) as Array<{
        id: string;
        charge_id: string;
        claim_id: string;
        claimed_amount_cents: number;
    }>);
    const claimIds = [...new Set(rawClaimLines.map((l) => l.claim_id))];
    const lineIds = rawClaimLines.map((l) => l.id);

    const paymentRows = rows.paymentsBacking;
    const fundingByAllocationRows = rows.fundingByAllocation;
    const fundingByShareRows = rows.fundingByShare;
    const claimRows = rows.claims;
    const varianceRows = rows.variances;

    const payments = new Map(paymentRows.map((p) => [p.id, p]));
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

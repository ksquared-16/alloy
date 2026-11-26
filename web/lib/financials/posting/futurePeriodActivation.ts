/**
 * THE DAY THE PERIOD BEGINS, THE CHARGES IN IT BECOME OWED — WITHOUT A HUMAN.
 *
 * ── WHAT THIS IS FOR ──
 *
 * `postingPeriodGate` makes a future-period charge a draft. That is only half a lifecycle: a draft
 * that nothing ever clears is the defect the Director found from the other direction — ordinary
 * billing waiting on a manual posting step no business rule asked for. This is the other half. On
 * each organisation's own business date, drafts whose billing period has begun are posted.
 *
 * ── IT ADDS NO POSTING IMPLEMENTATION, AND NO SECOND POSTING DECISION ──
 *
 * It calls `autoPostGeneratedCharge`, which is the path generated billing already takes, and that
 * in turn calls `postChildcareCharge`. So on the day a period opens, a charge crosses EXACTLY the
 * boundary it would have crossed on the day it was created:
 *
 *   * `posting_review` is resolved again, from the policies as they stand TODAY. This matters and is
 *     not incidental: a review boundary configured after the charge was written must still bind. A
 *     handler that simply posted every eligible draft would let a future-dated charge escape a
 *     control the organisation had since put in place.
 *   * the closed-period guard still refuses, so a period that opened and closed while a draft waited
 *     does not get posted retroactively.
 *   * the gate itself is re-evaluated against the authority's own read of the period, so the
 *     candidate query below is allowed to be approximate.
 *
 * ── THE QUERY IS A CANDIDATE FILTER, NOT AN AUTHORITY ──
 *
 * Discovery reads the label the gate wrote (`post_gate` and `post_not_before`) because that is one
 * indexed-enough jsonb read rather than a join PostgREST cannot express. It can be WRONG in only one
 * direction that matters — offering a charge whose period has not really begun — and the authority
 * refuses that, re-labels it, and the occurrence reports it as still waiting. A charge the filter
 * MISSES is picked up by the next day's occurrence. Neither error can post anything early.
 *
 * ── A NO-OP IS A SUCCESS, AND AN OCCURRENCE WITH NO TENANT ACTIVATES NOTHING ──
 *
 * Both for the same reasons automatic close states them: most days nothing is waiting, and
 * `scheduled_work.org_id` being null means "no tenant", never "every organisation".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchOrgBusinessDate } from "@/lib/financials/businessDate";
import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import {
    autoPostGeneratedCharge,
    type AutoPostOutcome,
} from "@/lib/financials/posting/autoPostGeneratedCharge";
import { PERIOD_NOT_STARTED_GATE } from "@/lib/financials/posting/postingPeriodGate";
import type { ScheduledWorkContext, ScheduledWorkOutcome } from "@/lib/scheduledWork/scheduledWorkTypes";

/** Bounded per occurrence, so a large backlog drains across days rather than in one attempt. */
export const FUTURE_PERIOD_ACTIVATION_LIMIT = 200;

export type ActivatableCharge = {
    id: string;
    billingPeriodId: string | null;
    postsOn: string | null;
};

/**
 * Drafts whose recorded wait is over, oldest wait first.
 *
 * Ordered by `post_not_before` so that if the limit truncates the set, the charges that have been
 * waiting longest are the ones that post — a backlog drains in commercial order rather than in
 * whatever order the table returns.
 */
export async function findActivatableFuturePeriodCharges(
    supabase: SupabaseClient,
    args: { orgId: string; todayYmd: string; limit?: number },
): Promise<ActivatableCharge[]> {
    const { data, error } = await supabase
        .from("charges")
        .select("id, billing_period_id, metadata")
        .eq("org_id", args.orgId)
        .eq("status", "draft")
        .eq("metadata->>post_gate", PERIOD_NOT_STARTED_GATE)
        /*
         * `yyyy-MM-dd` compares lexically in the order it compares chronologically, which is why the
         * date is stored in that form and why no cast is needed here.
         */
        .lte("metadata->>post_not_before", args.todayYmd)
        .order("metadata->>post_not_before", { ascending: true })
        .limit(args.limit ?? FUTURE_PERIOD_ACTIVATION_LIMIT);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
        id: string;
        billing_period_id: string | null;
        metadata: Record<string, unknown> | null;
    }>;
    return rows.map((r) => ({
        id: r.id,
        billingPeriodId: r.billing_period_id,
        postsOn: ((r.metadata ?? {})["post_not_before"] ?? null) as string | null,
    }));
}

export type FuturePeriodActivationDeps = {
    supabase: SupabaseClient;
    /** Injectable so a test can drive a fixed business date. Production resolves the org's own. */
    todayYmd?: string;
    limit?: number;
};

export async function evaluateFuturePeriodActivationOccurrence(
    ctx: ScheduledWorkContext,
    deps: FuturePeriodActivationDeps,
): Promise<ScheduledWorkOutcome> {
    const orgId = (ctx.orgId ?? "").trim();
    if (!orgId) {
        return {
            kind: "completed",
            reason: "no tenant on this occurrence; nothing to activate",
            diagnostic: { domain: "future_period_charge_activation", org_id: null, evaluated_for: ctx.dueAt },
        };
    }

    const limit = deps.limit ?? FUTURE_PERIOD_ACTIVATION_LIMIT;
    let todayYmd: string;
    let candidates: ActivatableCharge[];
    let policies: Awaited<ReturnType<typeof listFinancialPolicies>>;
    try {
        todayYmd = deps.todayYmd ?? (await fetchOrgBusinessDate(deps.supabase, orgId));
        candidates = await findActivatableFuturePeriodCharges(deps.supabase, { orgId, todayYmd, limit });
        /*
         * Loaded ONCE for the occurrence and passed into every posting decision, for the same reason
         * `autoPostGeneratedCharge` refuses to read them itself: two reads are two chances to
         * disagree about which policy version was effective.
         */
        policies = candidates.length ? await listFinancialPolicies(deps.supabase, orgId) : [];
    } catch (error) {
        /*
         * Discovery failed, so we do not know what was eligible. RETRYABLE: nothing has been posted,
         * and the gate means a charge missed today is simply offered again tomorrow.
         */
        return {
            kind: "retryable_failure",
            reason: "could not determine which future-period drafts are eligible to post",
            diagnostic: {
                domain: "future_period_charge_activation",
                org_id: orgId,
                error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
            },
        };
    }

    const posted: string[] = [];
    const stillWaiting: Array<{ charge_id: string; posts_on: string }> = [];
    const reviewRequired: string[] = [];
    const failed: Array<{ charge_id: string; retryable: boolean }> = [];

    for (const candidate of candidates) {
        let outcome: AutoPostOutcome;
        try {
            outcome = await autoPostGeneratedCharge(deps.supabase, {
                orgId,
                chargeId: candidate.id,
                /*
                 * SYSTEM. No actor is named: the clock posted this, and attributing it to the
                 * person who created the draft weeks ago would put a name on an act they did not
                 * perform. `created_by` on the row still records who authored the charge.
                 */
                actorUserId: null,
                policies,
                today: todayYmd,
                /*
                 * The same date the candidates were discovered against, forwarded to the authority
                 * so one occurrence reads the tenant's zone once and the gate cannot disagree with
                 * the discovery about what day it is.
                 */
                businessDateYmd: todayYmd,
            });
        } catch (error) {
            /* One charge refusing is not the occurrence failing; the others are independent. */
            failed.push({ charge_id: candidate.id, retryable: !(error instanceof Error) });
            continue;
        }
        switch (outcome.kind) {
            case "posted":
                posted.push(outcome.chargeId);
                break;
            case "period_not_started":
                /* The authority disagreed with the label. It is right; tomorrow asks again. */
                stillWaiting.push({ charge_id: outcome.chargeId, posts_on: outcome.postsOn });
                break;
            case "review_required":
                /* A boundary configured since the draft was written. It binds, and it is not work
                 * this handler may cross. */
                reviewRequired.push(outcome.chargeId);
                break;
            case "post_failed":
                failed.push({ charge_id: outcome.chargeId, retryable: outcome.attempt.retryable });
                break;
        }
    }

    const diagnostic = {
        domain: "future_period_charge_activation",
        org_id: orgId,
        evaluated_for: todayYmd,
        attempt: ctx.attemptNumber,
        worker_id: ctx.workerId,
        eligible_found: candidates.length,
        limit,
        posted_count: posted.length,
        posted,
        still_waiting: stillWaiting,
        review_required: reviewRequired,
        failed,
    };

    if (candidates.length === 0) {
        return { kind: "completed", reason: "no draft is waiting for a billing period that has begun", diagnostic };
    }

    return {
        kind: "completed",
        reason:
            `posted ${posted.length} charge(s) whose billing period has begun`
            + (reviewRequired.length ? `; ${reviewRequired.length} held for review` : "")
            + (stillWaiting.length ? `; ${stillWaiting.length} still waiting` : "")
            + (failed.length ? `; ${failed.length} failed` : ""),
        diagnostic,
    };
}

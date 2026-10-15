/**
 * MAKING GENERATED BILLING REAL, WITHOUT A HUMAN IN THE LOOP.
 *
 * ── THE DEFECT THIS CLOSES ──
 *
 * Generated billing created a draft and stopped. `generateTuitionCharges`, `periodicBillingHandler`,
 * `resolveDraftCharges`, `draftChargeResolutionService` and `consumptionService` contained no call to
 * the posting authority between them, so an ordinary tuition charge with a complete amount, a due
 * date and no review policy configured anywhere sat as a draft indefinitely. Thirty-five such rows
 * had accumulated, worth $4,852.26, the oldest 37 days.
 *
 * Worse than invisible: `resolveFinancialWorkQueue` surfaces exactly these rows as operator work,
 * with `status = 'draft'` as the eligibility, so the product had a ROUTINE HUMAN POSTING QUEUE for
 * ordinary billing. That is the thing the doctrine forbids.
 *
 * ── IT ADDS NO SECOND POSTING IMPLEMENTATION ──
 *
 * `postChildcareCharge` stays the only act that makes a childcare charge owed, and this calls it —
 * the same authority manual Add Charge uses, which is already correct and is the reference
 * lifecycle. `resolveChargePolicies` stays the only reader of `posting_review`. What was missing was
 * the step BETWEEN them, and that is all this is.
 *
 * ── THE THREE OUTCOMES, AND WHY A DRAFT MUST SAY WHICH ONE IT IS ──
 *
 *   posted           ordinary billing became real, unattended
 *   review_required  a configured policy asked for a human; a legitimate draft, never retried
 *   post_failed      posting was attempted and could not complete; durable, and retryable
 *
 * Before this, all three looked identical in the data: `status = 'draft'` and nothing else. A failed
 * post left its reason in an HTTP response the operator saw once and nowhere else, so "we tried and
 * could not" was indistinguishable from "nobody ever tried". `post_gate` is what makes them
 * distinguishable, and it is deliberately on `metadata` rather than a new column — charges already
 * carry `lifecycle_status`, `review_required` and `resolution_key` there, and a jsonb key needs no
 * migration to begin recording truth.
 *
 * ── RETRY REUSES THE CLOCK THAT ALREADY RUNS ──
 *
 * No new handler key and no bespoke cron. The periodic billing schedule already fires unattended on
 * the live five-minute wake, so a retryable failure is simply re-attempted by the next generation
 * run: `shouldRetryPost` decides, `postChildcareCharge` refuses an already-posted charge, and the
 * attempt count bounds it. Idempotent, bounded, observable and tenant-bound, through the authority
 * that already exists.
 *
 * Drafts created BEFORE this repair carry no `post_attempt` key, so they are never picked up —
 * the historical thirty-five are preserved as evidence, untouched, exactly as instructed.
 *
 * ── WHERE THE CLOSED-PERIOD GUARD GOES ──
 *
 * `postAttemptAllowed` is the one place a draft becomes posted on this path. When commercial close
 * exists, "refuse if the charge's billing period is closed" belongs HERE, and it must bind retry as
 * well as the first attempt — a retry that posted into a closed period would be the same breach
 * arriving later. Recorded now so the guard is not bolted onto one caller.
 */
import {
    EMPTY_FINANCIAL_POLICY_SCOPE,
    policyScopeNarrowingNeeded,
    resolveFinancialPolicyScope,
    type FinancialPolicyScope,
} from "@/lib/financials/policies/resolveFinancialPolicyScope";
import type { SupabaseClient } from "@supabase/supabase-js";

import { postChildcareCharge } from "@/lib/financials/childcareChargeService";
import { PERIOD_NOT_STARTED_GATE, periodNotStartedFacts } from "@/lib/financials/posting/postingPeriodGate";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

/** How many unattended attempts a retryable failure gets before it becomes operator attention. */
export const MAX_POST_ATTEMPTS = 5;

/**
 * WHY a draft is a draft. Four distinct answers, and the distinction is the product:
 *
 *   posted            not a gate — the key is cleared, because `status` already says it
 *   review_required   a configured `posting_review` boundary asked for a human; never retried
 *   post_failed       posting was attempted and could not complete; durable, bounded retry
 *   period_not_started the billing period has not begun; the clock clears it, nobody acts
 *
 * The fourth arrived with W7-F001. It is deliberately NOT a variant of `post_failed`: nothing
 * failed, no attempt budget should be spent, and an operator must never be asked to post it by hand.
 */
export type PostGate = "posted" | "review_required" | "post_failed" | "period_not_started";

/** The durable record of what posting did, written onto the charge. */
export type PostAttemptRecord = {
    attempts: number;
    first_attempted_at: string;
    last_attempted_at: string;
    last_error: string;
    retryable: boolean;
    /** True once attempts are exhausted or the failure is not retryable: operator attention. */
    attention_required: boolean;
};

export type AutoPostOutcome =
    | { kind: "posted"; chargeId: string }
    | { kind: "review_required"; chargeId: string; policyId: string }
    /** Waiting for its billing period to begin. Not a failure, and not operator work. */
    | { kind: "period_not_started"; chargeId: string; periodKey: string; postsOn: string }
    | { kind: "post_failed"; chargeId: string; attempt: PostAttemptRecord };

/**
 * Whether a failure is worth another unattended attempt.
 *
 * Conservative on purpose: a failure is retried only when it looks transient. A refusal the domain
 * MEANT — an amount that resolves to zero, a charge already posted, a guard — is not transient, and
 * retrying it would turn a clear answer into a loop that hides it from the operator.
 */
export function isRetryablePostFailure(message: string): boolean {
    const m = (message ?? "").toLowerCase();
    const permanent = [
        "immutable",
        "already posted",
        "cannot transition",
        "zero",
        "not found",
        "refused",
        "permission",
        "closed",
    ];
    if (permanent.some((p) => m.includes(p))) return false;
    return true;
}

/** A draft this repair created, whose failure was transient and is not yet exhausted. */
export function shouldRetryPost(metadata: Record<string, unknown> | null | undefined): boolean {
    const md = metadata ?? {};
    /*
     * A draft waiting for its billing period is cleared by `financials.future_period_charge.activate`
     * on the day that period begins, never by this budget. Stated explicitly rather than relying on
     * such a draft happening to carry no attempt record: if some future path ever does attempt and
     * fail one, the calendar must still be what releases it.
     */
    if (md["post_gate"] === PERIOD_NOT_STARTED_GATE) return false;
    const rec = md["post_attempt"] as PostAttemptRecord | undefined;
    if (!rec) return false; // never attempted by this repair — includes every historical draft
    if (!rec.retryable) return false;
    return rec.attempts < MAX_POST_ATTEMPTS;
}

/**
 * THE GUARD SEAM, AND WHERE COMMERCIAL CLOSE ACTUALLY BOUND.
 *
 * This existed so close would have one place to refuse a post, covering the first attempt and
 * every retry alike. Close went somewhere strictly better: `postChildcareCharge` itself, the
 * posting authority. Binding there covers EVERY caller — this repair, an operator action, a
 * generation run — rather than only the callers who remember to ask this function first, and it
 * reads the period the draft actually carries instead of trusting a hint passed in.
 *
 * The retry path needs nothing of its own as a result. A closed-period refusal comes back as a
 * conflict whose message contains "closed", `isRetryablePostFailure` classifies it PERMANENT, and
 * the draft stops retrying an illegal post and becomes attention work — which is exactly the
 * behaviour §11 asks for, arrived at without a second guard that could disagree with the first.
 *
 * Kept as a seam because a cheap pre-flight that avoids a doomed attempt may still be worth having;
 * it must never become the ONLY check, because a caller can skip it and the authority cannot.
 */
export function postAttemptAllowed(_charge: { billing_period_id?: string | null }): { ok: true } {
    return { ok: true };
}

function reviewPolicyFor(
    policies: readonly FinancialPolicyRow[],
    serviceId: string | null,
    today: string,
    scope: FinancialPolicyScope = EMPTY_FINANCIAL_POLICY_SCOPE,
): { required: boolean; policyId: string | null } {
    /*
     * Narrowed by the charge's own site and account, exactly as the write path narrows it
     * (`chargeLifecycleService.reviewRequiredByPolicy`). With `serviceId` alone a location- or
     * account-scoped review rule could never match here, so the write path and the auto-post path
     * gave two answers to "does this generated charge need a person?".
     */
    const r = resolveFinancialPolicy(
        policies,
        "posting_review",
        {
            serviceId: serviceId ?? undefined,
            locationId: scope.locationId ?? undefined,
            customerId: scope.customerId ?? undefined,
        },
        today,
    );
    /*
     * NO POLICY MEANS NO REVIEW. This mirrors `resolveChargePolicies` exactly rather than restating
     * the rule: `r.resolved ? value.required === true : false`. An absent policy has never meant
     * "require review", and the whole defect was that nothing acted on the `false`.
     */
    if (!r.resolved) return { required: false, policyId: null };
    return { required: r.policy.value.required === true, policyId: r.policy.id };
}

async function recordAttempt(
    supabase: SupabaseClient,
    args: { orgId: string; chargeId: string; metadata: Record<string, unknown>; error: string },
): Promise<PostAttemptRecord> {
    const prior = (args.metadata["post_attempt"] ?? null) as PostAttemptRecord | null;
    const now = new Date().toISOString();
    const retryable = isRetryablePostFailure(args.error);
    const attempts = (prior?.attempts ?? 0) + 1;
    const record: PostAttemptRecord = {
        attempts,
        first_attempted_at: prior?.first_attempted_at ?? now,
        last_attempted_at: now,
        last_error: args.error.slice(0, 500),
        retryable,
        attention_required: !retryable || attempts >= MAX_POST_ATTEMPTS,
    };
    /*
     * Merged into the existing metadata rather than replacing it: the row's provenance —
     * resolution_key, source, lifecycle_status — is what makes the failure diagnosable.
     */
    await supabase
        .from("charges")
        .update({
            metadata: { ...args.metadata, post_gate: "post_failed" satisfies PostGate, post_attempt: record },
            updated_at: now,
        })
        .eq("org_id", args.orgId)
        .eq("id", args.chargeId)
        .eq("status", "draft");
    return record;
}

/**
 * The charge's own row, and the service its obligation names.
 *
 * Read HERE rather than plumbed through every caller, and `service_id` specifically because a
 * SERVICE-SCOPED `posting_review` policy must not be silently bypassed. `resolveFinancialPolicy`
 * matches a service scope only when the context carries that service, so resolving with an absent
 * service would auto-post a charge an organisation had asked to review. The generated path does not
 * otherwise know the service — `draftConsumption` returns only the draft charge id — so one small
 * read is what keeps the review question answerable.
 */
async function loadPostingContext(
    supabase: SupabaseClient,
    args: { orgId: string; chargeId: string },
): Promise<{
    metadata: Record<string, unknown>;
    serviceId: string | null;
    status: string | null;
    billableSourceType: string | null;
    billableSourceId: string | null;
}> {
    const { data } = await supabase
        .from("charges")
        .select("metadata, status, billable_source_type, billable_source_id")
        .eq("org_id", args.orgId)
        .eq("id", args.chargeId)
        .maybeSingle();
    const row = (data ?? null) as {
        metadata: Record<string, unknown> | null;
        status: string | null;
        billable_source_type?: string | null;
        billable_source_id?: string | null;
    } | null;

    const { data: ob } = await supabase
        .from("resolved_obligations")
        .select("service_id")
        .eq("org_id", args.orgId)
        .eq("draft_charge_id", args.chargeId)
        .maybeSingle();
    const serviceId = ((ob ?? null) as { service_id: string | null } | null)?.service_id ?? null;

    return {
        metadata: { ...(row?.metadata ?? {}) },
        serviceId,
        status: row?.status ?? null,
        billableSourceType: row?.billable_source_type ?? null,
        billableSourceId: row?.billable_source_id ?? null,
    };
}

/**
 * Resolve the review question and, when nothing asks for a human, make the charge real.
 *
 * The caller supplies the policies it already loaded; this does not read them again, for the same
 * reason `resolveChargePolicies` loads them once — two reads are two chances to disagree about the
 * effective window.
 */
export async function autoPostGeneratedCharge(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        chargeId: string;
        serviceId?: string | null;
        actorUserId?: string | null;
        policies: readonly FinancialPolicyRow[];
        metadata?: Record<string, unknown> | null;
        /**
         * The date POLICY is resolved against — which `posting_review` version was effective.
         * Deliberately not the same parameter as the one below: a policy's effective window and
         * "what day is it for this tenant" are different questions, and one argument answering both
         * is how a UTC date ends up deciding a commercial calendar.
         */
        today: string;
        /**
         * The organisation's business date, when the caller already resolved it.
         *
         * Forwarded to the posting authority so a single occurrence that posts many charges reads
         * the tenant's zone once. Omitted by every ordinary caller, and then the authority resolves
         * it — it must never depend on a caller passing the right calendar.
         */
        businessDateYmd?: string | null;
    },
): Promise<AutoPostOutcome> {
    const loaded = await loadPostingContext(supabase, { orgId: args.orgId, chargeId: args.chargeId });
    /*
     * ALREADY POSTED IS NOT A FAILURE. A retry, a concurrent run, or a draft that something else
     * posted first all arrive here, and the answer is the same: the obligation is real.
     */
    if (loaded.status && loaded.status !== "draft") {
        return { kind: "posted", chargeId: args.chargeId };
    }
    const metadata = args.metadata ? { ...args.metadata } : loaded.metadata;
    /* The subject's scope, read only when some review rule is scoped to a site or an account. */
    const scope =
        policyScopeNarrowingNeeded(args.policies, "posting_review") && loaded.billableSourceType && loaded.billableSourceId
            ? await resolveFinancialPolicyScope(supabase, {
                  orgId: args.orgId,
                  billableSourceType: loaded.billableSourceType,
                  billableSourceId: loaded.billableSourceId,
              })
            : EMPTY_FINANCIAL_POLICY_SCOPE;
    const review = reviewPolicyFor(args.policies, args.serviceId ?? loaded.serviceId, args.today, scope);

    if (review.required) {
        /*
         * A LEGITIMATE DRAFT, and it says so. It is never retried, because nothing failed — it is
         * waiting for the review the organisation configured.
         */
        await supabase
            .from("charges")
            .update({
                metadata: { ...metadata, post_gate: "review_required" satisfies PostGate },
                updated_at: new Date().toISOString(),
            })
            .eq("org_id", args.orgId)
            .eq("id", args.chargeId)
            .eq("status", "draft");
        return { kind: "review_required", chargeId: args.chargeId, policyId: review.policyId ?? "" };
    }

    try {
        await postChildcareCharge(supabase, {
            orgId: args.orgId,
            chargeId: args.chargeId,
            actorUserId: args.actorUserId ?? null,
            businessDateYmd: args.businessDateYmd ?? null,
        });
        /*
         * ── THE OBLIGATION CONVERGES, AND ONLY NOW ───────────────────────────────────────────
         *
         * After the authority RETURNED, never before it was called. An obligation marked posted on
         * the strength of an attempt would claim real money that a failure then did not create, and
         * the deployed census already found the opposite drift: 21 obligations sitting `drafted`,
         * one of them holding a charge that was already posted.
         *
         * `review_status` is deliberately untouched. It answers whether anyone reviewed this, and
         * automatic posting is not review — writing `reviewed` here would record a review that
         * never happened and justify skipping a real one later.
         */
        await supabase
            .from("resolved_obligations")
            .update({ status: "posted", updated_at: new Date().toISOString() })
            .eq("org_id", args.orgId)
            .eq("draft_charge_id", args.chargeId)
            .in("status", ["drafted", "previewed"]);

        /*
         * `post_gate` is cleared on success rather than set to "posted": `status` already says
         * posted, and a second field saying the same thing is a second answer that can drift.
         */
        /* A charge that posted on retry must not keep looking failed. */
        if (metadata["post_gate"] != null || metadata["post_attempt"] != null) {
            const cleaned = { ...metadata };
            delete cleaned["post_gate"];
            delete cleaned["post_attempt"];
            /* The waiting label and its date go with the gate it explained. */
            delete cleaned["post_not_before"];
            delete cleaned["post_gate_period_key"];
            delete cleaned["post_gate_observed_on"];
            await supabase
                .from("charges")
                .update({ metadata: cleaned, updated_at: new Date().toISOString() })
                .eq("org_id", args.orgId)
                .eq("id", args.chargeId);
        }
        return { kind: "posted", chargeId: args.chargeId };
    } catch (err) {
        /*
         * ── THE PERIOD HAS NOT BEGUN, WHICH IS NOT A FAILURE ──
         *
         * The authority already labelled the draft `period_not_started` and already knows the date,
         * so there is nothing to record here and — importantly — no attempt to count. Routing this
         * through `recordAttempt` would spend one of five attempts per generation run on a charge
         * whose period is three weeks away, exhaust the budget, and present an ordinary future-dated
         * charge to the operator as attention work. Recognition is structural, through the refusal's
         * own marker, rather than by searching the message for words.
         */
        const waiting = periodNotStartedFacts(err);
        if (waiting) {
            return {
                kind: "period_not_started",
                chargeId: args.chargeId,
                periodKey: waiting.periodKey,
                postsOn: waiting.periodStartsOn,
            };
        }
        const message = err instanceof Error ? err.message : String(err);
        const attempt = await recordAttempt(supabase, {
            orgId: args.orgId, chargeId: args.chargeId, metadata, error: message,
        });
        return { kind: "post_failed", chargeId: args.chargeId, attempt };
    }
}

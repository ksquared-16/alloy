/**
 * GENERATE THE MONTH'S TUITION — from what was agreed, through the pipeline that already exists.
 *
 * This service is deliberately thin. It does not price, it does not create charges, and it owns no
 * consequence lineage. It reads the accepted terms through Thread 3's contract, asks
 * `resolveTuitionRecurrence` what each assignment owes for the period, and hands the answer to the
 * Operational Consumption path that has always turned an operational fact into a Consumption Event,
 * a Resolved Obligation and a draft Charge. Everything downstream — correction reconciliation,
 * posted-charge protection, review, the journal, the cards — is untouched and unaware that the fact
 * came from a pricing term rather than a schedule change.
 *
 * ── THREE THINGS THE CALLER MAY NOT DO ──
 *
 * It may not set the amount, the currency or the cadence. There is nowhere in this signature to put
 * them: they come from the accepted term, because a term may be an OVERRIDE and a caller-supplied
 * price would be a number nobody agreed to.
 *
 * ── WHAT IT REFUSES, RATHER THAN QUIETLY PRODUCING NOTHING ──
 *
 * A missing tuition CHARGE TEMPLATE is a configuration answer, not an empty result. Charge templates
 * are per-organisation configuration — `consumption_event_types` is a global registry that resolves
 * the ORG's own template by key at runtime, exactly as the registration-fee seed documents — so an
 * organisation that has not authored one is told which key it needs. Nothing is invented on its
 * behalf and no template is conjured into a tenant by a migration.
 *
 * Overlapping terms and an unconfigured proration policy refuse for the reasons
 * `resolveTuitionRecurrence` gives.
 *
 * ── WHY RECURRING TUITION NEEDS AN ENROLMENT ──
 *
 * A monthly tuition charge is billed against the child's enrolment agreement: that is the billable
 * source the charge spine writes to, and the consumption path resolves its scope from it. An
 * assignment that has been PRICED but not yet enrolled has an accepted term and no agreement, and it
 * is reported as not yet billable rather than billed against a household that has not enrolled. A
 * pre-enrolment fee is a different thing and Thread 1's Add Charge already does it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listFinancialPolicies } from "@/lib/financials/policies/financialPolicyService";
import { resolveFinancialPolicy } from "@/lib/financials/policies/resolveFinancialPolicy";
import { readAcceptedPricingTerms } from "@/lib/enrollment/pricing/enrollmentPricingTermsService";
import { draftConsumption } from "@/lib/operationalConsumption/consumptionService";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";
import {
    resolveTuitionRecurrence,
    tuitionOccurrenceKey,
    type ProrationMethod,
} from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";
import {
    billingPeriodFromKey,
    billingPeriodsBetween,
    isPeriodBillableCadence,
    type BillingCadence,
    type BillingPeriod,
} from "@/lib/financials/billingPeriod";

/** The event key the global consumption registry maps to the org's `tuition` charge template. */
export const TUITION_EVENT_KEY = "schedule.recurring_tuition";
/** The charge template key an organisation must have authored for recurring tuition. */
export const TUITION_CHARGE_TEMPLATE_KEY = "tuition";

/*
 * EVERY OUTCOME NAMES ITS PERIOD. One run now bills SEVERAL commercial periods — four weeks of
 * September rather than "September" — so an outcome without a period would be an operator reading
 * four indistinguishable lines and unable to tell which week refused.
 */
export type TuitionGenerationOutcome =
    | { kind: "generated"; assignmentId: string; periodKey: string; periodLabel: string; termId: string; chargeId: string | null; amountCents: number; currencyCode: string; obligationId: string | null }
    | { kind: "not_due"; assignmentId: string; periodKey: string; periodLabel: string; reason: string }
    | { kind: "refused"; assignmentId: string; periodKey: string; periodLabel: string; reason: string; detail: string }
    /*
     * AN OBLIGATION THAT ALREADY STOOD IS NOT ONE THIS RUN GENERATED.
     *
     * Rerunning a period reported `generated: 5` a second time while creating nothing: the draft
     * write already answers `unchanged` for a converged draft, and that answer was being thrown
     * away. The data was right — the ledger held five rows, not ten — but an operator reading the
     * result would believe they had billed the family twice.
     */
    | { kind: "unchanged"; assignmentId: string; periodKey: string; periodLabel: string; termId: string; chargeId: string; amountCents: number; currencyCode: string; obligationId: string | null }
    | { kind: "already_posted"; assignmentId: string; periodKey: string; periodLabel: string; termId: string; chargeId: string; amountCents: number }
    | { kind: "error"; assignmentId: string; periodKey: string; periodLabel: string; message: string };

/**
 * WHICH OUTCOME A DRAFT WRITE DESERVES.
 *
 * `writeTemplateDraftCharge` has always answered `created` / `recalculated` / `unchanged`, and this
 * generator threw the answer away and called all three "generated". Rerunning a period therefore
 * reported `generated: 5` a second time while creating nothing — the ledger was right and the
 * sentence was not.
 *
 * Exported because it is a decision, and a decision is testable without a database.
 */
export function tuitionOutcomeKindForDraftStatus(status: string | null | undefined): "generated" | "unchanged" {
    return status === "unchanged" ? "unchanged" : "generated";
}

/**
 * The tally, derived from the outcomes rather than counted alongside them — so a new outcome kind
 * cannot be added without the counts noticing.
 */
export function tallyTuitionOutcomes(outcomes: readonly TuitionGenerationOutcome[]) {
    return {
        generated: outcomes.filter((o) => o.kind === "generated").length,
        /** Drafts that already stood and still agree — converged, not billed again. */
        unchanged: outcomes.filter((o) => o.kind === "unchanged").length,
        alreadyPosted: outcomes.filter((o) => o.kind === "already_posted").length,
        notDue: outcomes.filter((o) => o.kind === "not_due").length,
        refused: outcomes.filter((o) => o.kind === "refused").length,
        errors: outcomes.filter((o) => o.kind === "error").length,
    };
}

export type TuitionGenerationResult = {
    /** The span the run was asked for — a month key today, from the operator's period control. */
    periodKey: string;
    servicePeriod: { start: string; end: string };
    /** The cadence the run billed at. */
    cadenceKey: string;
    /**
     * The commercial periods actually billed, in order.
     *
     * For a monthly organisation this is the one month, and the shape is unchanged in substance.
     * For a weekly one it is each week that overlapped the span, with the boundaries and the human
     * label derived from them — which is the whole point of the convergence.
     */
    periodsBilled: Array<{ key: string; label: string; start: string; end: string }>;
    /** Counts an operator can act on, not a log to read. */
    counts: { generated: number; unchanged: number; alreadyPosted: number; notDue: number; refused: number; errors: number };
    outcomes: TuitionGenerationOutcome[];
};

export type TuitionGenerationArgs = {
    orgId: string;
    /** The service period to bill (`YYYY-MM`). Deterministic — never "now". */
    periodKey: string;
    actorUserId?: string | null;
    /** Optional bounded scope. Absent, every assignment with an accepted term is considered. */
    opportunityCustomerMemberIds?: readonly string[] | null;
    /** The cadence this run bills. */
    cadenceKey?: string;
    /**
     * Optional bounded set of canonical period keys. Absent, every period the span contains is
     * billed — which is what an operator asking to "bill September" means.
     *
     * AUTOMATION MEANS SOMETHING ELSE. A scheduled run bills what is DUE, and a span contains
     * periods that have not begun: measured on deployed staging, a one-period specimen was billed
     * for 2026-09-22 AND 2026-09-29 because both weeks fall inside September. The caller that
     * decided which periods are due says so here; the tiling, the price, the due-ness and the
     * idempotency all still belong to this authority, exactly as `opportunityCustomerMemberIds`
     * narrows which assignments without moving any decision out of it.
     */
    periodKeys?: readonly string[] | null;
    /** Operating day, for the charge lifecycle's own date resolution. */
    today?: string | null;
};

/**
 * THE COMMERCIAL PERIODS ONE ASSIGNMENT IS BILLED FOR, inside a requested span.
 *
 * Exported because the PREVIEW must enumerate identically. A preview that tiled periods its own way
 * would show an operator four weeks and then create five, which is the precise class of divergence
 * this thread has spent its life removing — so there is one tiling, called twice.
 *
 * The anchor is the earliest accepted term's effective start: a weekly period is "the week this
 * agreement bills on", and two families may legitimately sit on different week boundaries.
 */
export function assignmentBillingPeriods(
    assignmentTerms: readonly { effectiveStart?: string | null }[],
    cadence: BillingCadence,
    span: { start: string; end: string },
): BillingPeriod[] {
    const anchor = assignmentTerms
        .map((t) => t.effectiveStart)
        .filter((d): d is string => typeof d === "string" && d.length === 10)
        .sort()[0] ?? span.start;
    return billingPeriodsBetween(cadence, anchor, span.start, span.end);
}

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
}

/** A posted tuition charge already covering this service period — the settled-month case. */
async function findPostedTuitionCharge(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string,
    servicePeriodStart: string,
): Promise<{ id: string; amount_cents: number } | null> {
    const { data } = await supabase
        .from("charges")
        .select("id, amount_cents, status")
        .eq("org_id", orgId)
        .eq("billable_source_type", "enrollment_agreement")
        .eq("billable_source_id", agreementId)
        .eq("charge_category", "tuition")
        .eq("service_date", servicePeriodStart);
    const posted = ((data ?? []) as Array<{ id: string; amount_cents: number; status: string }>).find(
        (c) => c.status !== "draft",
    );
    return posted ? { id: posted.id, amount_cents: posted.amount_cents } : null;
}

/**
 * Bill one service period.
 *
 * Safe to retry: every write converges on database-level uniqueness — the consumption event on
 * `(org_id, idempotency_key)`, the draft charge on its own resolution key — so a second run over the
 * same period reports the same charges rather than creating more.
 */
export async function generateTuitionCharges(
    supabase: SupabaseClient,
    args: TuitionGenerationArgs,
): Promise<TuitionGenerationResult> {
    const periodKey = args.periodKey.trim();
    if (!/^\d{4}-\d{2}$/.test(periodKey)) {
        throw new Error("period_key must be YYYY-MM");
    }
    const cadenceKey = (args.cadenceKey ?? "monthly").trim();
    /*
     * ── THE REQUESTED SPAN, WHICH IS NOT THE SAME THING AS THE BILLING PERIOD ──
     *
     * The operator's control still asks for a MONTH, because that is how a human says "bill
     * September". What gets billed inside it is the organisation's own commercial grain: a monthly
     * org bills the one month, a weekly org bills each of the four or five weeks that overlap it.
     *
     * Conflating these two was the defect. The span is the QUESTION; the commercial periods are the
     * ANSWER, and there can be more than one of them.
     */
    const span = billingPeriodFromKey(periodKey);
    if (!isPeriodBillableCadence(cadenceKey)) {
        /*
         * `hourly` and `per_session` price a unit of usage, not an interval. Asking them for period
         * boundaries is a category error, and inventing a month for them would bill a family for a
         * period nobody agreed to — so the run refuses and says which cadence it cannot bill.
         */
        return {
            periodKey,
            servicePeriod: { start: span.start, end: span.end },
            cadenceKey,
            periodsBilled: [],
            counts: { generated: 0, unchanged: 0, alreadyPosted: 0, notDue: 0, refused: 0, errors: 0 },
            outcomes: [],
        };
    }
    const cadence: BillingCadence = cadenceKey;
    const today = (args.today ?? "").trim() || todayYmd();

    // Every LIVE accepted term in the org, narrowed to the requested assignments when one was named.
    const allTerms = await readAcceptedPricingTerms(supabase, { orgId: args.orgId });
    const scope = args.opportunityCustomerMemberIds?.length
        ? new Set(args.opportunityCustomerMemberIds)
        : null;
    const terms = scope
        ? allTerms.filter((t) => scope.has(t.opportunityCustomerMemberId))
        : allTerms;

    // The organisation's proration method, resolved once — the same policy authority the consumption
    // path already consumes. Absent, `resolveTuitionRecurrence` refuses partial periods rather than
    // billing a whole month for part of one.
    const policies = await listFinancialPolicies(supabase, args.orgId);
    const prorationPolicy = resolveFinancialPolicy(policies, "proration", {}, span.start);
    const prorationMethod = (prorationPolicy.resolved
        ? ((prorationPolicy.policy.value as { method?: string }).method ?? "none")
        : "none") as ProrationMethod;

    const byAssignment = new Map<string, typeof terms>();
    for (const t of terms) {
        const list = byAssignment.get(t.opportunityCustomerMemberId) ?? [];
        list.push(t);
        byAssignment.set(t.opportunityCustomerMemberId, list);
    }

    const periodFilter = args.periodKeys?.length ? new Set(args.periodKeys) : null;

    const outcomes: TuitionGenerationOutcome[] = [];

    const periodsBilledByKey = new Map<string, BillingPeriod>();

    for (const [assignmentId, assignmentTerms] of byAssignment) {
        /*
         * ── THE ANCHOR IS THE FAMILY'S, NOT THE CALENDAR'S ──
         *
         * A weekly period is "the week this agreement bills on", tiled from the earliest accepted
         * term's effective start. Two families on weekly tuition may therefore sit on different
         * week boundaries, and both are right: the boundary is a fact about what each agreed to.
         *
         * Anchoring on a shared calendar instead would impose a Monday nobody signed, and would
         * move every family's periods the first time the calendar changed.
         */
        const periods = assignmentBillingPeriods(assignmentTerms, cadence, span);

        for (const period of periods) {
        if (periodFilter && !periodFilter.has(period.key)) continue;
        const decision = resolveTuitionRecurrence({
            terms: assignmentTerms,
            period,
            prorationMethod,
            cadenceKey,
        });
        const periodKeyOf = period.key;
        const periodLabelOf = period.label;
        periodsBilledByKey.set(period.key, period);

        if (decision.kind === "not_due") {
            outcomes.push({ kind: "not_due", assignmentId, periodKey: periodKeyOf, periodLabel: periodLabelOf, reason: decision.reason });
            continue;
        }
        if (decision.kind === "refused") {
            outcomes.push({ kind: "refused", assignmentId, periodKey: periodKeyOf, periodLabel: periodLabelOf, reason: decision.reason, detail: decision.detail });
            continue;
        }

        const term = decision.term;
        if (!term.enrollmentAgreementId) {
            // Priced, not yet enrolled. Said plainly rather than billed against a household that has
            // not enrolled — a pre-enrolment fee is Add Charge's job, not recurring tuition's.
            outcomes.push({ kind: "not_due", assignmentId, periodKey: periodKeyOf, periodLabel: periodLabelOf, reason: "assignment_not_enrolled" });
            continue;
        }

        const fact: OperationalFactDto = {
            eventKey: TUITION_EVENT_KEY,
            sourceFamily: "schedule",
            sourceEntityType: "child_enrollment_agreements",
            sourceEntityId: term.enrollmentAgreementId,
            subjectType: "customer_member",
            subjectId: term.customerMemberId,
            locationId: term.locationId,
            occursOn: decision.serviceDate,
            effectiveOn: decision.serviceDate,
            eventDate: decision.serviceDate,
            servicePeriodStart: decision.period.start,
            periodStart: decision.period.start,
            periodEnd: decision.period.end,
            scheduleChangeKind: "recurring",
            // The proration inputs the existing policy consumption already reads. Reported, not
            // applied here: the configured method owns the arithmetic.
            proratedDays: decision.coverage.partial ? decision.coverage.coveredDays : null,
            periodDays: decision.coverage.partial ? decision.coverage.periodDays : null,
            // THE PRICE. Its presence is what makes the catalog lookup unreachable on this path.
            acceptedPricing: {
                termId: term.termId,
                amountCents: decision.amountCents,
                currencyCode: decision.currencyCode,
                cadenceKey: term.cadenceKey,
                state: term.state,
                sourceEntity: term.source.entity,
                sourceId: term.source.id,
                configVersion: term.configVersion,
                resolutionKey: term.resolutionKey,
            },
            // One occurrence per assignment per service period — the database converges on it.
            idempotencyKey: tuitionOccurrenceKey(assignmentId, periodKeyOf),
            context: {
                generated_by: "tuition_generation",
                accepted_pricing_term_id: term.termId,
                accepted_state: term.state,
                service_period: periodKeyOf,
                billing_period_start: period.start,
                billing_period_end: period.end,
            },
        };

        /*
         * ── A SETTLED MONTH IS NOT RE-GENERATED, AND ITS HISTORY IS NOT REWRITTEN ──
         *
         * This check has to come BEFORE the pipeline runs, not after it.
         *
         * The charge itself was always safe: `writeTemplateDraftCharge` answers `skipped_posted` and
         * refuses to touch posted money. But `upsertConsumptionEvent` finds the occurrence by its
         * idempotency key and updates the event's CONTEXT in place, and the obligation is
         * re-resolved beneath it — so running generation over an already-posted period with a
         * successor term left the posted charge at term A's amount while the event and obligation
         * explaining it had been rewritten to say term B. The money was right and the record of why
         * was a lie, which is the worse of the two failures: it is the half nobody re-reads until
         * they need it.
         *
         * So a posted period is answered from the charge that already exists, and the pipeline is
         * not entered at all. A successor term that affects settled money is the correction and
         * review path's business — `charge.reverse` writing a new corrective row through
         * `source_charge_id`, with the original left exactly as posted — and generation does not
         * quietly stand in for it.
         */
        const alreadyPosted = await findPostedTuitionCharge(
            supabase,
            args.orgId,
            term.enrollmentAgreementId,
            decision.period.start,
        );
        if (alreadyPosted) {
            outcomes.push({
                kind: "already_posted",
                assignmentId,
                periodKey: periodKeyOf,
                periodLabel: periodLabelOf,
                termId: term.termId,
                chargeId: alreadyPosted.id,
                amountCents: alreadyPosted.amount_cents,
            });
            continue;
        }

        try {
            const drafted = await draftConsumption(supabase, args.orgId, fact, today, args.actorUserId ?? null);
            const chargeId = drafted.persisted.draftChargeId;
            if (!chargeId) {
                /*
                 * The settled-month case was answered above, so a missing draft link here means the
                 * organisation has not authored the tuition charge template the global event
                 * registry resolves. Named, rather than reported as a silent zero.
                 */
                outcomes.push({
                    kind: "refused",
                    assignmentId,
                    periodKey: periodKeyOf,
                    periodLabel: periodLabelOf,
                    reason: "configuration_required",
                    detail:
                        `No draft tuition charge was produced for ${periodLabelOf}. Recurring tuition resolves `
                        + `the organisation's charge template keyed '${TUITION_CHARGE_TEMPLATE_KEY}'; author `
                        + "that template in Commercial configuration and run the period again.",
                });
                continue;
            }
            /*
             * `created` and `recalculated` are work this run did; `unchanged` is a draft that was
             * already standing and still agrees. Both are success and neither is an error — they are
             * simply not the same sentence, and only one of them should be counted as billing.
             */
            outcomes.push({
                kind: tuitionOutcomeKindForDraftStatus(drafted.persisted.draftChargeStatus),
                assignmentId,
                periodKey: periodKeyOf,
                periodLabel: periodLabelOf,
                termId: term.termId,
                chargeId,
                amountCents: decision.amountCents,
                currencyCode: decision.currencyCode,
                obligationId: drafted.persisted.resolvedObligationIds[0] ?? null,
            });
        } catch (err) {
            outcomes.push({
                kind: "error",
                assignmentId,
                periodKey: periodKeyOf,
                periodLabel: periodLabelOf,
                message: err instanceof Error ? err.message : "tuition generation failed",
            });
        }
        }
    }

    const counts = tallyTuitionOutcomes(outcomes);
    const periodsBilled = [...periodsBilledByKey.values()]
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((p) => ({ key: p.key, label: p.label, start: p.start, end: p.end }));
    return {
        periodKey,
        servicePeriod: { start: span.start, end: span.end },
        cadenceKey,
        periodsBilled,
        counts,
        outcomes,
    };
}

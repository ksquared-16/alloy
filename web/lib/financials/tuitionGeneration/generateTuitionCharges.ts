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

/** The event key the global consumption registry maps to the org's `tuition` charge template. */
export const TUITION_EVENT_KEY = "schedule.recurring_tuition";
/** The charge template key an organisation must have authored for recurring tuition. */
export const TUITION_CHARGE_TEMPLATE_KEY = "tuition";

export type TuitionGenerationOutcome =
    | { kind: "generated"; assignmentId: string; termId: string; chargeId: string | null; amountCents: number; currencyCode: string; obligationId: string | null }
    | { kind: "not_due"; assignmentId: string; reason: string }
    | { kind: "refused"; assignmentId: string; reason: string; detail: string }
    | { kind: "error"; assignmentId: string; message: string };

export type TuitionGenerationResult = {
    periodKey: string;
    servicePeriod: { start: string; end: string };
    /** Counts an operator can act on, not a log to read. */
    counts: { generated: number; notDue: number; refused: number; errors: number };
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
    /** Operating day, for the charge lifecycle's own date resolution. */
    today?: string | null;
};

function todayYmd(): string {
    return new Date().toISOString().slice(0, 10);
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
    const prorationPolicy = resolveFinancialPolicy(policies, "proration", {}, `${periodKey}-01`);
    const prorationMethod = (prorationPolicy.resolved
        ? ((prorationPolicy.policy.value as { method?: string }).method ?? "none")
        : "none") as ProrationMethod;

    const byAssignment = new Map<string, typeof terms>();
    for (const t of terms) {
        const list = byAssignment.get(t.opportunityCustomerMemberId) ?? [];
        list.push(t);
        byAssignment.set(t.opportunityCustomerMemberId, list);
    }

    const outcomes: TuitionGenerationOutcome[] = [];

    for (const [assignmentId, assignmentTerms] of byAssignment) {
        const decision = resolveTuitionRecurrence({
            terms: assignmentTerms,
            periodKey,
            prorationMethod,
            cadenceKey,
        });

        if (decision.kind === "not_due") {
            outcomes.push({ kind: "not_due", assignmentId, reason: decision.reason });
            continue;
        }
        if (decision.kind === "refused") {
            outcomes.push({ kind: "refused", assignmentId, reason: decision.reason, detail: decision.detail });
            continue;
        }

        const term = decision.term;
        if (!term.enrollmentAgreementId) {
            // Priced, not yet enrolled. Said plainly rather than billed against a household that has
            // not enrolled — a pre-enrolment fee is Add Charge's job, not recurring tuition's.
            outcomes.push({ kind: "not_due", assignmentId, reason: "assignment_not_enrolled" });
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
            idempotencyKey: tuitionOccurrenceKey(assignmentId, periodKey),
            context: {
                generated_by: "tuition_generation",
                accepted_pricing_term_id: term.termId,
                accepted_state: term.state,
                service_period: periodKey,
            },
        };

        try {
            const drafted = await draftConsumption(supabase, args.orgId, fact, today, args.actorUserId ?? null);
            const chargeId = drafted.persisted.draftChargeId;
            if (!chargeId) {
                // The pipeline resolved no chargeable obligation. The overwhelmingly common cause is
                // that the organisation has not authored the tuition charge template the global
                // event registry resolves — so it is named rather than reported as a silent zero.
                outcomes.push({
                    kind: "refused",
                    assignmentId,
                    reason: "configuration_required",
                    detail:
                        `No draft tuition charge was produced for ${periodKey}. Recurring tuition resolves `
                        + `the organisation's charge template keyed '${TUITION_CHARGE_TEMPLATE_KEY}'; author `
                        + "that template in Commercial configuration and run the period again.",
                });
                continue;
            }
            outcomes.push({
                kind: "generated",
                assignmentId,
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
                message: err instanceof Error ? err.message : "tuition generation failed",
            });
        }
    }

    const counts = {
        generated: outcomes.filter((o) => o.kind === "generated").length,
        notDue: outcomes.filter((o) => o.kind === "not_due").length,
        refused: outcomes.filter((o) => o.kind === "refused").length,
        errors: outcomes.filter((o) => o.kind === "error").length,
    };
    const period = resolveTuitionRecurrence({ terms: [], periodKey }).period;
    return { periodKey, servicePeriod: { start: period.start, end: period.end }, counts, outcomes };
}

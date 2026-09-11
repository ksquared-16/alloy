/**
 * WHAT AGREED TUITION IS THIS CREDIT REDUCING?
 *
 * A vacation credit does not price a day of care. It gives back part of the
 * recurring tuition a family already agreed to for the period the vacation falls
 * in — so its value has to come from that agreed term, not from what the catalog
 * would quote today. If the family accepted $1,200 and the catalog has since
 * moved to $1,400, a credit derived from the catalog would hand back money
 * against a price nobody agreed to, and the reduction could not answer the only
 * question an auditor asks of it.
 *
 * ── EVERY OWNER HERE ALREADY EXISTED ──
 *
 *   the terms          `readAcceptedPricingTerms` — supersession and effective
 *                      windows are its rules, not ours
 *   the selection      `resolveTuitionRecurrence` — the SAME function ordinary
 *                      tuition generation uses to pick one term for a period,
 *                      including its refusal when two terms overlap
 *   the period         `billingPeriodForDate` / `billingPeriodDays`
 *   the arithmetic     `prorateAmountCents`
 *
 * This module joins them and owns no rule of its own. In particular it does not
 * re-implement "which term applies": duplicating that query is how a credit and
 * the tuition it reduces come to disagree about which price was in force.
 *
 * ── IT REFUSES RATHER THAN APPROXIMATES ──
 *
 * No term, a term that has not started, a term that has ended, two overlapping
 * terms — each returns an unresolved answer naming which, and none of them falls
 * back to the catalog to produce a number. A credit nobody can explain is worse
 * than a credit that has not been calculated yet, because only one of the two
 * stops and asks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readAcceptedPricingTerms } from "@/lib/enrollment/pricing/enrollmentPricingTermsService";
import { billingPeriodDays, billingPeriodForDate } from "@/lib/financials/billingPeriod";
import { resolveTuitionRecurrence } from "@/lib/financials/tuitionGeneration/resolveTuitionRecurrence";
import { prorateAmountCents } from "@/lib/operationalConsumption/scheduleInterpretation";

export type VacationCreditValuation =
    | {
          resolved: true;
          amountCents: number;
          currencyCode: string;
          /** The agreed term this credit reduces — the audit answer. */
          termId: string;
          acceptedPeriodAmountCents: number;
          periodKey: string;
          periodStart: string;
          periodEnd: string;
          periodDays: number;
          creditedDays: number;
      }
    | { resolved: false; reason: string; detail: string };

/**
 * Value one credited day against the accepted tuition for its billing period.
 *
 * `creditedDays` is 1 here because one absence is one day. It is a parameter
 * rather than a constant so a future multi-day known-away period values through
 * the same path instead of growing a second one.
 */
export async function valueVacationCredit(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        enrollmentAgreementId: string;
        /** The service date the vacation falls on. */
        anchorDate: string;
        creditedDays?: number;
        prorationMethod?: Parameters<typeof resolveTuitionRecurrence>[0]["prorationMethod"];
    },
): Promise<VacationCreditValuation> {
    const period = billingPeriodForDate(args.anchorDate);
    const periodDays = billingPeriodDays(period);
    if (periodDays <= 0) {
        return { resolved: false, reason: "no_period_length", detail: `Could not measure ${period.key}.` };
    }

    const terms = await readAcceptedPricingTerms(supabase, {
        orgId: args.orgId,
        enrollmentAgreementId: args.enrollmentAgreementId,
    });

    /*
     * The SAME selection tuition generation performs. Its refusals are reused
     * verbatim — an overlap it would refuse to bill is an overlap this must
     * refuse to credit, or the two would disagree about which price was in force
     * for one period.
     */
    const decision = resolveTuitionRecurrence({
        terms,
        periodKey: period.key,
        prorationMethod: args.prorationMethod ?? null,
    });

    if (decision.kind === "refused") {
        return { resolved: false, reason: decision.reason, detail: decision.detail };
    }
    if (decision.kind === "not_due") {
        return {
            resolved: false,
            reason: decision.reason,
            detail: `No accepted tuition term governs ${period.key} for this agreement.`,
        };
    }

    const creditedDays = args.creditedDays ?? 1;
    const amount = prorateAmountCents(decision.amountCents, creditedDays, periodDays);
    if (amount == null) {
        return { resolved: false, reason: "no_amount", detail: "The accepted term produced no usable amount." };
    }

    return {
        resolved: true,
        amountCents: amount,
        currencyCode: decision.currencyCode,
        termId: decision.term.termId,
        acceptedPeriodAmountCents: decision.amountCents,
        periodKey: period.key,
        periodStart: period.start,
        periodEnd: period.end,
        periodDays,
        creditedDays,
    };
}

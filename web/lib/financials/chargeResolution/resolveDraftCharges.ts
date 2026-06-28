/**
 * Draft Charge Resolution (P3.3) — pure read model.
 *
 * Composes committed enrollment intent + a resolved rate (P3.2) + a service
 * period + a calculation strategy + a responsibility target into a DRAFT
 * childcare charge INTENT. It computes the amount but performs NO writes: this
 * is Financial Resolution, kept strictly separate from Posting.
 *
 * What this is NOT: invoices, AR, ledger, payments, subsidy, posting, or any
 * job-table coupling.
 *
 * Pure functions only — no DB, no IO.
 */

import {
    deriveBillableQuantity,
    type BillableQuantitySignal,
} from "@/lib/financials/chargeResolution/billableQuantity";
import type { ChargeResponsibility } from "@/lib/financials/chargeResolution/responsibility";
import type { ResolvedRate } from "@/lib/financials/rates/resolveRate";

/** Billable source discriminator for childcare draft charges. */
export const BILLABLE_SOURCE_ENROLLMENT_AGREEMENT = "enrollment_agreement" as const;
export const TUITION_CHARGE_CATEGORY = "tuition" as const;

export type ServicePeriod = {
    /** Stable, human/idempotency-friendly key, e.g. "2026-03" or "2026-W10". */
    key: string;
    start: string;
    end: string;
};

export type DraftChargeIntent = {
    resolved: true;
    /** Deterministic dedupe key (one draft per agreement/period/basis/rule). */
    resolutionKey: string;
    orgId: string;
    enrollmentAgreementId: string;
    billableSourceType: typeof BILLABLE_SOURCE_ENROLLMENT_AGREEMENT;
    billableSourceId: string;
    chargeCategory: typeof TUITION_CHARGE_CATEGORY;
    amountCents: number;
    currencyCode: string;
    serviceDate: string;
    description: string;
    responsibility: ChargeResponsibility;
    metadata: Record<string, unknown>;
};

export type UnresolvedDraftCharge = {
    resolved: false;
    reason: string;
};

export type DraftChargeResolution = DraftChargeIntent | UnresolvedDraftCharge;

export function buildResolutionKey(args: {
    enrollmentAgreementId: string;
    period: ServicePeriod;
    scheduleBasis: string;
    rateRuleId: string;
}): string {
    return [
        TUITION_CHARGE_CATEGORY,
        args.enrollmentAgreementId,
        args.period.key,
        args.scheduleBasis,
        args.rateRuleId,
    ].join(":");
}

export type ResolveDraftTuitionChargeInput = {
    orgId: string;
    enrollmentAgreementId: string;
    period: ServicePeriod;
    rate: ResolvedRate;
    responsibility: ChargeResponsibility;
    signal?: BillableQuantitySignal;
};

/**
 * Resolve a single tuition draft charge intent. Returns a structured
 * unresolved result (never throws for "not billable") so callers can surface a
 * clear reason and skip without emitting an empty draft.
 */
export function resolveDraftTuitionCharge(
    input: ResolveDraftTuitionChargeInput
): DraftChargeResolution {
    const { orgId, enrollmentAgreementId, period, rate, responsibility } = input;

    const quantity = deriveBillableQuantity({
        rateBasis: rate.rateBasis,
        calculationStrategy: rate.calculationStrategy,
        periodStart: period.start,
        periodEnd: period.end,
        signal: input.signal,
    });
    if (!quantity.resolved) {
        return { resolved: false, reason: quantity.reason };
    }

    const unitAmountCents = rate.amountCents;
    const amountCents = unitAmountCents * quantity.quantity;
    if (!Number.isInteger(amountCents) || amountCents === 0) {
        return { resolved: false, reason: "non_billable_amount" };
    }

    const resolutionKey = buildResolutionKey({
        enrollmentAgreementId,
        period,
        scheduleBasis: rate.scheduleBasis,
        rateRuleId: rate.rule.id,
    });

    const metadata: Record<string, unknown> = {
        resolution_key: resolutionKey,
        billable_source_type: BILLABLE_SOURCE_ENROLLMENT_AGREEMENT,
        service_period: { key: period.key, start: period.start, end: period.end },
        schedule_basis: rate.scheduleBasis,
        rate_basis: rate.rateBasis,
        calculation_strategy: rate.calculationStrategy,
        rate_plan_id: rate.plan.id,
        rate_rule_id: rate.rule.id,
        unit_amount_cents: unitAmountCents,
        quantity: quantity.quantity,
        quantity_unit: quantity.unit,
        responsibility: {
            party_type: responsibility.partyType,
            party_id: responsibility.partyId,
            basis: responsibility.basis,
        },
    };
    if (quantity.placeholder) {
        metadata.calculation_placeholder = quantity.placeholder;
    }

    const description = `Tuition ${period.key} (${rate.scheduleBasis}, ${quantity.quantity} ${quantity.unit})`;

    return {
        resolved: true,
        resolutionKey,
        orgId,
        enrollmentAgreementId,
        billableSourceType: BILLABLE_SOURCE_ENROLLMENT_AGREEMENT,
        billableSourceId: enrollmentAgreementId,
        chargeCategory: TUITION_CHARGE_CATEGORY,
        amountCents,
        currencyCode: rate.currencyCode,
        serviceDate: period.start,
        description,
        responsibility,
        metadata,
    };
}

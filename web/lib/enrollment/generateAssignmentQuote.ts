/**
 * Generate an immutable assignment quote/estimate from commercial tuition configuration.
 * Never posts ledger charges, invoices, or payments.
 */

import {
    appendAssignmentQuoteSnapshot,
    type AssignmentQuoteSnapshot,
} from "@/lib/enrollment/assignmentQuoteSnapshot";
import {
    resolveEnrollmentTuitionRate,
    type TuitionRateCandidate,
} from "@/lib/adminV2/runtime/focusPanel/financialConfig/resolveEnrollmentTuitionRate";
import type { TuitionBillingPeriod } from "@/lib/commercial/tuitionRates";

function formatLabel(rateCents: number, billingPeriod: TuitionBillingPeriod): string {
    const dollars = (rateCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    return `${dollars}/${billingPeriod}`;
}

export type GenerateAssignmentQuoteInput = {
    metadata: Record<string, unknown> | null | undefined;
    rates: TuitionRateCandidate[];
    programKey: string | null;
    scheduleKey: string | null;
    locationId: string | null;
    offeringId?: string | null;
    offeringLabel?: string | null;
    offeringVersionKey?: string | null;
    effectiveDate: string;
    actorUserId: string | null;
    generatedAt?: string;
    snapshotId: string;
    pricingInputsExtra?: Record<string, unknown>;
    /** Scopes quote history to one assignment entry. */
    scheduleAssignmentId?: string | null;
};

export type GenerateAssignmentQuoteResult =
    | { ok: true; metadata: Record<string, unknown>; snapshot: AssignmentQuoteSnapshot }
    | { ok: false; error: string };

function resolveRateForQuote(input: GenerateAssignmentQuoteInput) {
    const offeringId = input.offeringId?.trim() || null;
    if (offeringId) {
        const hit = input.rates.find((r) => r.id === offeringId);
        if (hit) {
            return {
                rateId: hit.id,
                rateCents: hit.rate_cents,
                billingPeriod: hit.billing_period,
                rateLabel: formatLabel(hit.rate_cents, hit.billing_period),
                isLocationOverride: Boolean(
                    input.locationId && hit.location_id === input.locationId,
                ),
            };
        }
    }
    return resolveEnrollmentTuitionRate(
        input.rates,
        input.programKey,
        input.scheduleKey,
        input.locationId,
        formatLabel,
    );
}

/**
 * Resolve eligible rate, stamp tuition_plan_id onto metadata, append immutable snapshot.
 */
export function generateAssignmentQuoteSnapshot(
    input: GenerateAssignmentQuoteInput,
): GenerateAssignmentQuoteResult {
    const resolved = resolveRateForQuote(input);
    if (!resolved) {
        return {
            ok: false,
            error: "No eligible tuition plan matches the current site, program, and schedule.",
        };
    }

    const offeringId = (input.offeringId ?? resolved.rateId).trim();
    if (!offeringId) {
        return { ok: false, error: "Tuition offering id missing." };
    }

    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const pricing_inputs: Record<string, unknown> = {
        program_key: input.programKey,
        schedule_key: input.scheduleKey,
        location_id: input.locationId,
        billing_period: resolved.billingPeriod,
        rate_cents: resolved.rateCents,
        rate_id: resolved.rateId,
        is_location_override: resolved.isLocationOverride,
        ...(input.pricingInputsExtra ?? {}),
    };

    const prior = input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {};
    // Legacy child-level stamp retained for compat; per-entry quotes are authoritative.
    prior.tuition_plan_id = offeringId;

    const { metadata, snapshot } = appendAssignmentQuoteSnapshot(prior, {
        id: input.snapshotId,
        offering_id: offeringId,
        offering_version_key: input.offeringVersionKey ?? resolved.rateId,
        offering_label: input.offeringLabel ?? resolved.rateLabel,
        amount_cents: resolved.rateCents,
        currency: "USD",
        effective_date: input.effectiveDate.slice(0, 10),
        pricing_inputs,
        created_by: input.actorUserId,
        generated_at: generatedAt,
        schedule_assignment_id: input.scheduleAssignmentId ?? null,
    });

    return { ok: true, metadata, snapshot };
}

/** List rates that match program+schedule (eligible pool for picker). */
export function listEligibleTuitionPlans(args: {
    rates: TuitionRateCandidate[];
    programKey: string | null;
    scheduleKey: string | null;
    locationId: string | null;
}): Array<TuitionRateCandidate & { resolvedLabel: string }> {
    if (!args.programKey || !args.scheduleKey) return [];
    return args.rates
        .filter((r) => r.program_key === args.programKey && r.schedule_key === args.scheduleKey)
        .map((r) => ({
            ...r,
            resolvedLabel: formatLabel(r.rate_cents, r.billing_period),
        }))
        .sort((a, b) => {
            const aLoc = args.locationId && a.location_id === args.locationId ? 0 : 1;
            const bLoc = args.locationId && b.location_id === args.locationId ? 0 : 1;
            if (aLoc !== bLoc) return aLoc - bLoc;
            return a.rate_cents - b.rate_cents;
        });
}

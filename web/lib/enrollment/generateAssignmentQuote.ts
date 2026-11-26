/**
 * The assignment's tuition estimate snapshot — a PRESENTATION record, not a decision.
 *
 * "Quote" is this module's historical name, not a domain. There is no quote entity, no quote
 * lifecycle and no quote workspace: a resolution for an assignment that is proposed or
 * future-effective is still a resolution for that assignment. What an operator ACCEPTS is an
 * effective-dated `enrollment_pricing_terms` row, written by the registered
 * `enrollment.pricing.accept` / `.override` actions.
 *
 * This module no longer matches anything. It used to run its own resolver over
 * `program_key` / `schedule_key` / `billing_period` — columns dropped from
 * `commercial_tuition_rates` in July — which is how the estimate came to be computed against a
 * shape the database did not have. It is now HANDED the option Commercial Execution resolved, and
 * only records it.
 *
 * Never posts ledger charges, invoices, or payments.
 */

import {
    appendAssignmentQuoteSnapshot,
    type AssignmentQuoteSnapshot,
} from "@/lib/enrollment/assignmentQuoteSnapshot";

/** The already-resolved option this snapshot records. Resolution happened in Commercial Execution. */
export type ResolvedTuitionForSnapshot = {
    rateId: string;
    rateCents: number;
    billingPeriod: string;
    rateLabel: string;
    isLocationOverride: boolean;
};

export type GenerateAssignmentQuoteInput = {
    metadata: Record<string, unknown> | null | undefined;
    /** What Commercial Execution resolved. This module does not choose it. */
    resolved: ResolvedTuitionForSnapshot | null;
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
};

export type GenerateAssignmentQuoteResult =
    | { ok: true; metadata: Record<string, unknown>; snapshot: AssignmentQuoteSnapshot }
    | { ok: false; error: string };

/**
 * Stamp tuition_plan_id onto metadata and append the immutable snapshot for the resolved option.
 */
export function generateAssignmentQuoteSnapshot(
    input: GenerateAssignmentQuoteInput,
): GenerateAssignmentQuoteResult {
    const resolved = input.resolved;
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
    });

    return { ok: true, metadata, snapshot };
}

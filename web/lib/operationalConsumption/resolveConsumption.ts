/**
 * Operational Consumption — pure resolver (Slice 1). Turns a normalized
 * operational fact + its Consumption Event Type + the Commercial Model's already-
 * resolved Charge intent into a Consumption Event + zero-or-one Resolved
 * Obligation. Pure, recomputable, no DB / no IO.
 *
 * Doctrine: docs/platform/modules/operational-consumption-platform.md
 *   * Consumption Events are NOT charges; some produce no charge, some one, and
 *     some may later fan out into many obligations.
 *   * The commercial computation is DELEGATED to the existing Charge Template
 *     resolver (resolveChargeFromTemplate). Consumption never reimplements pricing.
 *   * Posting is the only authoritative money write — nothing here posts.
 */

import { assertValidIsoDate } from "@/lib/childcareOperational/effectiveDating";
import type { ChargeIntent } from "@/lib/financials/chargeLifecycle/resolveChargeFromTemplate";
import type {
    ConsumptionEventIntent,
    ConsumptionEventTypeRow,
    OperationalFactDto,
    ResolvedObligationIntent,
} from "@/lib/operationalConsumption/consumptionTypes";

/** Stable idempotency key for a fact: cev:<event_key>:<entity_type>:<entity_id>:<occurs_on>. */
export function deriveConsumptionIdempotencyKey(fact: OperationalFactDto, occursOn: string): string {
    if (fact.idempotencyKey && fact.idempotencyKey.trim()) return fact.idempotencyKey.trim();
    return `cev:${fact.eventKey}:${fact.sourceEntityType}:${fact.sourceEntityId}:${occursOn}`;
}

export type ConsumptionResolution = {
    event: ConsumptionEventIntent;
    /** Zero-or-one obligation in Slice 1 (the model allows fan-out later). */
    obligations: ResolvedObligationIntent[];
    /** Human/debug explanation of the interpretation. */
    explanation: Record<string, unknown>;
};

/**
 * Map a Charge intent (from the Commercial Model resolver) onto a Resolved
 * Obligation. Returns null when the charge resolver produced nothing chargeable.
 */
function obligationFromChargeIntent(
    eventType: ConsumptionEventTypeRow,
    chargeIntent: ChargeIntent | null,
): ResolvedObligationIntent | null {
    if (!chargeIntent || !chargeIntent.eligible || !chargeIntent.wouldCreateDraft) return null;
    return {
        chargeTemplateId: chargeIntent.templateId,
        serviceId: chargeIntent.serviceId,
        amountCents: chargeIntent.amountCents,
        currencyCode: chargeIntent.currencyCode,
        responsibilityKey: chargeIntent.responsibilityKey ?? eventType.default_responsibility_key ?? null,
        occursOn: chargeIntent.occursOn,
        billableOn: chargeIntent.billableOn,
        reviewRequired: chargeIntent.reviewRequired,
        status: "previewed",
        resolutionKey: chargeIntent.resolutionKey,
        explanation: {
            charge_template_key: chargeIntent.templateKey,
            amount_strategy: chargeIntent.amountStrategy,
            gl_mapping_key: chargeIntent.glMappingKey,
            lifecycle_status: chargeIntent.lifecycleStatus,
            amount_resolvable: chargeIntent.amountCents != null,
        },
    };
}

/**
 * Resolve a fact into a Consumption Event + obligations. `chargeIntent` is the
 * output of the Commercial Model Charge Template resolver (or null when the event
 * type maps to no template / no template is configured for the org).
 */
export function resolveConsumption(
    fact: OperationalFactDto,
    eventType: ConsumptionEventTypeRow,
    chargeIntent: ChargeIntent | null,
    today: string,
): ConsumptionResolution {
    assertValidIsoDate(today, "today");
    const occursOn = fact.occursOn?.trim() || today;
    assertValidIsoDate(occursOn, "occursOn");
    const idempotencyKey = deriveConsumptionIdempotencyKey(fact, occursOn);

    const obligation = obligationFromChargeIntent(eventType, chargeIntent);
    const obligations = obligation ? [obligation] : [];

    // Event status: resolved when an obligation exists; otherwise no_obligation
    // (a valid outcome — some facts carry no commercial meaning).
    const status = obligations.length > 0 ? "resolved" : "no_obligation";

    const explanation: Record<string, unknown> = {
        event_type_id: eventType.id,
        event_type_active: eventType.is_active,
        charge_template_key: eventType.charge_template_key,
        matched_charge_template: chargeIntent?.eligible === true,
        charge_ineligible_reason: chargeIntent && !chargeIntent.eligible ? chargeIntent.reason : null,
        obligation_count: obligations.length,
    };

    const event: ConsumptionEventIntent = {
        eventTypeId: eventType.id,
        sourceFamily: fact.sourceFamily,
        eventKey: fact.eventKey,
        sourceEntityType: fact.sourceEntityType,
        sourceEntityId: fact.sourceEntityId,
        subjectType: fact.subjectType ?? null,
        subjectId: fact.subjectId ?? null,
        locationId: fact.locationId ?? null,
        occursOn,
        effectiveOn: fact.effectiveOn ?? null,
        status,
        context: { ...(fact.context ?? {}), source_family: fact.sourceFamily },
        idempotencyKey,
    };

    return { event, obligations, explanation };
}

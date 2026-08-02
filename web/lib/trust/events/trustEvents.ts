/**
 * Trust Runtime events — a closed, code-owned vocabulary over the existing
 * `workflow_events` spine.
 *
 * No new bus, no new ledger, no new workflow runtime. This follows the
 * precedent the Objective Platform set: the store is shared, the vocabulary and
 * the envelope are platform-owned.
 *
 * @see docs/platform/trust/trust-runtime.md — Runtime Events
 */

import { emitEvent } from "@/lib/emitEvent";

export const TRUST_ENTITY_TYPE = "trust_decision" as const;

export const TRUST_EVENT_TYPES = [
    "trust_decision_requested",
    "trust_decision_prepared",
    "trust_information_classified",
    "trust_privacy_transformed",
    "trust_knowledge_retrieved",
    "trust_strategy_selected",
    "trust_reasoning_completed",
    "trust_validation_succeeded",
    "trust_validation_failed",
    "trust_decision_package_created",
    "trust_decision_presented",
    "trust_decision_accepted",
    "trust_decision_rejected",
] as const;

export type TrustEventType = (typeof TRUST_EVENT_TYPES)[number];

export function isSupportedTrustEventType(value: string): value is TrustEventType {
    return (TRUST_EVENT_TYPES as readonly string[]).includes(value);
}

export type TrustEventInput = {
    readonly org_id: string;
    readonly event_type: TrustEventType;
    readonly contract_id: string;
    readonly decision_class_key: string;
    readonly correlation_id: string;
    /** Never prompts, never draft bodies, never redacted-payload copies. */
    readonly detail?: Record<string, unknown>;
};

/**
 * Emits one Trust event. Never throws into the runtime: an event-store failure
 * must not turn a produced Decision Package into an error, because the package
 * is the operational artifact and the event is observability.
 */
export async function emitTrustEvent(input: TrustEventInput): Promise<{ emitted: boolean }> {
    try {
        await emitEvent({
            org_id: input.org_id,
            event_type: input.event_type,
            entity_type: TRUST_ENTITY_TYPE,
            entity_id: input.contract_id,
            payload: {
                schema_version: 1,
                contract_id: input.contract_id,
                decision_class_key: input.decision_class_key,
                correlation_id: input.correlation_id,
                ...(input.detail ?? {}),
            },
        });
        return { emitted: true };
    } catch (e) {
        console.warn("[trust-events] emitEvent failed:", e instanceof Error ? e.message : e);
        return { emitted: false };
    }
}

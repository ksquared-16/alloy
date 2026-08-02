/**
 * CaptureOutcome() — append-only observations referencing an immutable package.
 *
 * This is the ONLY way post-creation lifecycle is represented. Nothing here
 * writes to a Decision Package, and nothing here executes anything: an
 * `executed` observation records that an execution authority acted, as evidence
 * after the fact.
 *
 * @see docs/platform/trust/trust-platform-decisions.md — Decision 020
 */

import { emitTrustEvent } from "@/lib/trust/events/trustEvents";
import type { TrustObservationKind, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

export type CaptureOutcomeInput = {
    readonly repository: TrustRepository;
    readonly org_id: string;
    readonly package_id: string;
    readonly contract_id: string;
    readonly decision_class_key: string;
    readonly correlation_id: string;
    readonly observation_kind: TrustObservationKind;
    readonly observed_by_actor_type: "operator" | "system" | "automation";
    readonly observed_by_actor_id?: string | null;
    readonly channel: string;
    readonly execution_reference?: string | null;
    readonly detail?: Record<string, unknown>;
};

const OBSERVATION_EVENT: Partial<
    Record<TrustObservationKind, "trust_decision_presented" | "trust_decision_accepted" | "trust_decision_rejected">
> = {
    presented: "trust_decision_presented",
    accepted: "trust_decision_accepted",
    rejected: "trust_decision_rejected",
};

export async function captureOutcome(input: CaptureOutcomeInput): Promise<void> {
    await input.repository.insertObservation({
        org_id: input.org_id,
        package_id: input.package_id,
        observation_kind: input.observation_kind,
        observed_by_actor_type: input.observed_by_actor_type,
        observed_by_actor_id: input.observed_by_actor_id ?? null,
        channel: input.channel,
        execution_reference: input.execution_reference ?? null,
        detail: input.detail ?? {},
    });

    const eventType = OBSERVATION_EVENT[input.observation_kind];
    if (eventType) {
        await emitTrustEvent({
            org_id: input.org_id,
            event_type: eventType,
            contract_id: input.contract_id,
            decision_class_key: input.decision_class_key,
            correlation_id: input.correlation_id,
            detail: { package_id: input.package_id },
        });
    }
}

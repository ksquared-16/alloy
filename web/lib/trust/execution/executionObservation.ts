/**
 * Mapping an authoritative command result into a Trust observation.
 *
 * Trust records what an execution authority DID. It never records what it hopes
 * happened: an observation is produced only from a result the Operational
 * Command Runtime has already returned as committed, and acceptance alone
 * produces nothing.
 *
 * The result type here is narrow and provider-independent on purpose. Importing
 * `CommandExecutionResult` would drag the whole command-runtime surface —
 * registered-action results, mutation results, relationship results, impact
 * previews — into `lib/trust`, and Trust has no use for any of it. The adapter
 * that owns the real result maps it down to this shape.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.5
 */

import type { TrustObservationInput } from "@/lib/trust/persistence/trustDecisionRepository";
import type { TrustResolvedExecutionBinding } from "@/lib/trust/execution/proposedCommandBinding";
import type { TrustServerActor } from "@/lib/trust/execution/executionConfirmation";

/**
 * The narrow, provider-independent view of what the command runtime returned.
 *
 * `committed` is the ONLY status that yields an executed observation, and it is
 * the command runtime's word — never a preview, never an acceptance.
 */
export type AuthoritativeCommandOutcome =
    | {
          readonly status: "committed";
          readonly invocation_id: string;
          readonly canonical_command_key: string;
          readonly execution_owner: string;
      }
    | {
          /** The command runtime declined: blocked, invalid, unauthorized, unavailable. */
          readonly status: "refused";
          readonly invocation_id: string;
          readonly failure_status: string;
          readonly error_code: string;
      }
    | {
          /** The attempt did not reach a verdict — transport, timeout, crash. */
          readonly status: "infrastructure_failure";
          readonly invocation_id: string;
          readonly error_code: string;
      };

/** Why an execution did not succeed. Refusal and infrastructure failure are not the same event. */
export const EXECUTION_FAILURE_CLASSES = ["command_refused", "infrastructure_failure"] as const;
export type ExecutionFailureClass = (typeof EXECUTION_FAILURE_CLASSES)[number];

export type ExecutionObservationPlan = {
    /** `null` when the outcome must produce no observation at all. */
    readonly observation: TrustObservationInput | null;
    readonly reason: string;
};

/**
 * Builds the observation for an authoritative outcome.
 *
 * Bounded detail only. The full operational result is deliberately not copied:
 * Trust is not a mirror of the operational record, and a blind copy would drag
 * customer data into an append-only store that has no privacy report over it.
 */
export function planExecutionObservation(input: {
    readonly binding: TrustResolvedExecutionBinding;
    readonly outcome: AuthoritativeCommandOutcome;
    readonly actor: TrustServerActor;
    readonly channel: string;
}): ExecutionObservationPlan {
    const base = {
        org_id: input.binding.org_id,
        package_id: input.binding.package_id,
        observed_by_actor_type: input.actor.actor_type,
        observed_by_actor_id: input.actor.actor_id,
        channel: input.channel,
    } as const;

    if (input.outcome.status === "committed") {
        return {
            reason: "The Operational Command Runtime reported a committed mutation.",
            observation: {
                ...base,
                observation_kind: "executed",
                // The authoritative invocation id, and nothing derived from it.
                execution_reference: input.outcome.invocation_id,
                detail: {
                    canonical_command_key: input.outcome.canonical_command_key,
                    execution_owner: input.outcome.execution_owner,
                    binding_version: input.binding.binding_version,
                    package_fingerprint: input.binding.package_fingerprint,
                },
            },
        };
    }

    const failureClass: ExecutionFailureClass =
        input.outcome.status === "refused" ? "command_refused" : "infrastructure_failure";

    return {
        reason:
            failureClass === "command_refused"
                ? "The Operational Command Runtime declined the invocation. Nothing was mutated."
                : "The invocation did not reach a verdict. Whether anything was mutated is unknown to Trust.",
        observation: {
            ...base,
            observation_kind: "outcome",
            execution_reference: input.outcome.invocation_id,
            detail: {
                result: "failed",
                failure_class: failureClass,
                error_code: input.outcome.error_code,
                ...(input.outcome.status === "refused" ? { failure_status: input.outcome.failure_status } : {}),
                binding_version: input.binding.binding_version,
                package_fingerprint: input.binding.package_fingerprint,
            },
        },
    };
}

/**
 * Keys the execution detail may carry. Anything else is operational content
 * that belongs in the operational record, not in a Trust observation.
 */
export const ALLOWED_EXECUTION_DETAIL_KEYS: readonly string[] = [
    "canonical_command_key",
    "execution_owner",
    "binding_version",
    "package_fingerprint",
    "result",
    "failure_class",
    "error_code",
    "failure_status",
];

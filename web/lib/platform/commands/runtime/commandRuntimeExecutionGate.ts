/**
 * Command Runtime execution enablement.
 *
 * Fail closed: owners/capabilities must be explicitly enabled.
 * P1.S2: RegisteredAction (maturity executable).
 * P2.S1: Lead Status Mutation Runtime — exact keys only (not owner-global).
 */

import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import type { CapabilityExecutionOwner } from "@/lib/platform/commands/capabilityTypes";

/**
 * Per-owner facade execution gate.
 * `mutation_runtime` stays false globally — P2.S1 uses capability-specific support.
 */
export const COMMAND_RUNTIME_EXECUTION_BY_OWNER: Readonly<
    Record<CapabilityExecutionOwner, boolean>
> = {
    registered_action: true,
    admin_action: false,
    mutation_runtime: false,
    relationship_runtime: false,
    tour_domain: false,
    processing_identity: false,
    scheduling_domain: false,
    navigation: false,
    workflow: false,
    configuration_runtime: false,
    none: false,
};

/**
 * P2.S1 Lead Status Mutation facade keys (exact match only).
 * Do not enable via `mark_lost` alias — that remains legacy update_status behavior.
 */
export const LEAD_STATUS_MUTATION_FACADE_COMMAND_KEYS = [
    "update_lead_status",
    "close_lead",
] as const;

export type LeadStatusMutationFacadeCommandKey =
    (typeof LEAD_STATUS_MUTATION_FACADE_COMMAND_KEYS)[number];

/**
 * @deprecated Prefer {@link isCommandRuntimeFacadeExecutionSupported}.
 * Preparation remains side-effect free.
 */
export const COMMAND_RUNTIME_EXECUTION_ENABLED = false as const;

export function isExecutionOwnerEnabledForFacade(
    owner: CapabilityExecutionOwner
): boolean {
    return COMMAND_RUNTIME_EXECUTION_BY_OWNER[owner] === true;
}

export function isLeadStatusMutationFacadeSupported(commandKey: string): boolean {
    const key = (commandKey ?? "").trim();
    return (LEAD_STATUS_MUTATION_FACADE_COMMAND_KEYS as readonly string[]).includes(key);
}

/**
 * Whether `/api/admin/actions/execute` should invoke the Command Runtime facade.
 * Capability Registry owns execution-owner truth; this gate owns migration readiness.
 */
export function isCommandRuntimeFacadeExecutionSupported(commandKey: string): boolean {
    const key = (commandKey ?? "").trim();
    if (!key) return false;

    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status !== "known") return false;
    const cap = resolved.capability;

    // P1.S2 RegisteredAction
    if (cap.maturity === "executable" && cap.executionOwner === "registered_action") {
        return isExecutionOwnerEnabledForFacade("registered_action");
    }

    // P2.S1 Lead Status Mutation — exact requested key + registry owner truth
    if (
        cap.executionOwner === "mutation_runtime" &&
        isLeadStatusMutationFacadeSupported(key) &&
        (cap.canonicalCommandKey === "update_lead_status" ||
            cap.canonicalCommandKey === "close_lead")
    ) {
        return true;
    }

    return false;
}

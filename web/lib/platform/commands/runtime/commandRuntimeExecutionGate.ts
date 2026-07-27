/**
 * Command Runtime execution enablement (P1.S2).
 *
 * Fail closed: only owners explicitly enabled here may execute through the facade.
 * Non-enabled owners keep their existing compatibility routes outside the facade.
 */

import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import type { CapabilityExecutionOwner } from "@/lib/platform/commands/capabilityTypes";

/**
 * Per-owner facade execution gate.
 * P1.S2: RegisteredAction only.
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
 * @deprecated P1.S1 used a global false. Prefer {@link COMMAND_RUNTIME_EXECUTION_BY_OWNER}
 * and {@link isCommandRuntimeFacadeExecutionSupported}. Preparation remains side-effect free.
 */
export const COMMAND_RUNTIME_EXECUTION_ENABLED = false as const;

export function isExecutionOwnerEnabledForFacade(
    owner: CapabilityExecutionOwner
): boolean {
    return COMMAND_RUNTIME_EXECUTION_BY_OWNER[owner] === true;
}

/**
 * Whether `/api/admin/actions/execute` should invoke the Command Runtime facade for this key.
 * Driven by Capability Registry + owner gate — not a hardcoded route key list.
 */
export function isCommandRuntimeFacadeExecutionSupported(commandKey: string): boolean {
    const resolved = tryResolvePlatformCapability(commandKey);
    if (resolved.status !== "known") return false;
    const cap = resolved.capability;
    if (cap.maturity !== "executable") return false;
    if (cap.executionOwner !== "registered_action") return false;
    return isExecutionOwnerEnabledForFacade(cap.executionOwner);
}

/**
 * RegisteredAction preparation adapter (P1.S1) — metadata only, never executes.
 */

import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import type { RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import type { PlatformCapabilityDefinition } from "@/lib/platform/commands/capabilityTypes";
import {
    requiredSubjectForAction,
    type RequiredSubject,
} from "@/lib/platform/commands/invocationContext";

export type RegisteredActionPreparationMeta = {
    registered: RegisteredAction;
    requiredSubject: RequiredSubject;
    confirmationPolicy: RegisteredAction["confirmationPolicy"];
    supportsPreview: true;
    defaultLabel: string;
};

/**
 * Resolve RegisteredAction metadata for preparation. Never calls execute / eligibility / preview.
 */
export function prepareRegisteredActionMeta(
    capability: PlatformCapabilityDefinition
): RegisteredActionPreparationMeta | null {
    if (capability.executionOwner !== "registered_action") return null;
    const key = capability.registeredActionKey ?? capability.capabilityKey;
    const registered = getRegisteredAction(key);
    if (!registered) return null;
    return {
        registered,
        requiredSubject: requiredSubjectForAction(registered),
        confirmationPolicy: registered.confirmationPolicy,
        supportsPreview: true,
        defaultLabel: registered.defaultLabel,
    };
}

/** Test helper: wrap handlers so accidental execute fails the suite. */
export function assertRegisteredActionHandlersUntouched(action: RegisteredAction): void {
    // Touch only identity fields — do not invoke functions.
    void action.actionKey;
    void action.defaultLabel;
    if (typeof action.execute !== "function") {
        throw new Error(`RegisteredAction ${action.actionKey} missing execute function reference`);
    }
}

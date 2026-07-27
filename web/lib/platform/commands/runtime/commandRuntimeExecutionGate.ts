/**
 * Command Runtime execution enablement.
 *
 * Fail closed: owners/capabilities must be explicitly enabled.
 * P1.S2: RegisteredAction
 * P2.S1 / P2.S2: Mutation Runtime — exact keys (owner globally false)
 * P3.S1: Relationship Runtime — exact keys (owner globally false)
 */

import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import type { CapabilityExecutionOwner } from "@/lib/platform/commands/capabilityTypes";

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

export const LEAD_STATUS_MUTATION_FACADE_COMMAND_KEYS = [
    "update_lead_status",
    "close_lead",
] as const;

export type LeadStatusMutationFacadeCommandKey =
    (typeof LEAD_STATUS_MUTATION_FACADE_COMMAND_KEYS)[number];

export const CHILD_ENROLLMENT_MUTATION_FACADE_COMMAND_KEYS = [
    "update_child_enrollment_status",
    "waitlist_child",
    "enroll_child",
] as const;

export type ChildEnrollmentMutationFacadeCommandKey =
    (typeof CHILD_ENROLLMENT_MUTATION_FACADE_COMMAND_KEYS)[number];

/** P3.S1 Relationship — exact keys only (no Add Family Member hub). */
export const RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS = [
    "add_parent_guardian",
    "link_existing_person",
] as const;

export type RelationshipRuntimeFacadeCommandKey =
    (typeof RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS)[number];

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

export function isChildEnrollmentMutationFacadeSupported(commandKey: string): boolean {
    const key = (commandKey ?? "").trim();
    return (CHILD_ENROLLMENT_MUTATION_FACADE_COMMAND_KEYS as readonly string[]).includes(key);
}

export function isRelationshipRuntimeFacadeSupported(commandKey: string): boolean {
    const key = (commandKey ?? "").trim();
    return (RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS as readonly string[]).includes(key);
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

    if (cap.maturity === "executable" && cap.executionOwner === "registered_action") {
        return isExecutionOwnerEnabledForFacade("registered_action");
    }

    if (cap.executionOwner === "mutation_runtime") {
        if (
            isLeadStatusMutationFacadeSupported(key) &&
            (cap.canonicalCommandKey === "update_lead_status" ||
                cap.canonicalCommandKey === "close_lead")
        ) {
            return true;
        }
        if (
            isChildEnrollmentMutationFacadeSupported(key) &&
            (cap.canonicalCommandKey === "update_child_enrollment_status" ||
                cap.canonicalCommandKey === "waitlist_child" ||
                cap.canonicalCommandKey === "enroll_child")
        ) {
            return true;
        }
        return false;
    }

    if (cap.executionOwner === "relationship_runtime") {
        return (
            isRelationshipRuntimeFacadeSupported(key) &&
            (cap.canonicalCommandKey === "add_parent_guardian" ||
                cap.canonicalCommandKey === "link_existing_person")
        );
    }

    return false;
}

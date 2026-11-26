/**
 * Command Runtime execution enablement.
 *
 * Fail closed: owners/capabilities must be explicitly enabled.
 * P1.S2: RegisteredAction
 * P2.S1 / P2.S2: Mutation Runtime — exact keys (owner globally false)
 * P3.S1–P3.S3: Relationship Runtime — exact keys (owner globally false)
 * P4.S2/S3: Destructive/replacement — exact allowlist
 * P5.S1: Tour domain — exact key (reschedule_tour)
 */

import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import { relationshipDefinitionCommandKeys } from "@/lib/fields/relationship/relationshipDefinitions";
import type { CapabilityExecutionOwner } from "@/lib/platform/commands/capabilityTypes";
import {
    isDestructiveCapabilityCommitEnabled,
    isDestructiveOrReplacementCapability,
} from "@/lib/platform/commands/runtime/destructive";

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

/**
 * Relationship Runtime facade — exact keys only.
 * P3.S1: parent/guardian + link existing person
 * P3.S2: contact-role commands (distinct capabilities; shared executor)
 * P3.S3: child relationship commands (create/link child identity)
 * Not included: Add Family Member hub. make_primary_contact → P4.S2 destructive allowlist.
 */
const NATIVE_RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS = [
    "link_existing_person",
    "add_billing_contact",
    "add_child",
    "link_existing_child",
] as const;

/**
 * DERIVED: every relationship definition's canonical command, plus the native commands that have no
 * definition row. This was an exact-key allowlist, which meant a newly configured relationship could
 * never execute. Definitions come first so the relationship model is the authority for its own keys.
 */
export const RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS: readonly string[] = [
    ...relationshipDefinitionCommandKeys(),
    ...NATIVE_RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS,
];

export type RelationshipRuntimeFacadeCommandKey =
    (typeof NATIVE_RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS)[number] | (string & {});

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

export const DESTRUCTIVE_FACADE_COMMAND_KEYS = [
    "make_primary_contact",
    "delete_lead",
    "cancel_tour",
] as const;

export type DestructiveFacadeCommandKey = (typeof DESTRUCTIVE_FACADE_COMMAND_KEYS)[number];

/** @deprecated Prefer {@link isDestructiveFacadeSupported}. */
export const DESTRUCTIVE_REPLACEMENT_FACADE_COMMAND_KEYS = DESTRUCTIVE_FACADE_COMMAND_KEYS;

export type DestructiveReplacementFacadeCommandKey = DestructiveFacadeCommandKey;

export function isDestructiveFacadeSupported(commandKey: string): boolean {
    const key = (commandKey ?? "").trim();
    return (
        (DESTRUCTIVE_FACADE_COMMAND_KEYS as readonly string[]).includes(key) &&
        isDestructiveCapabilityCommitEnabled(key)
    );
}

/** @deprecated Prefer {@link isDestructiveFacadeSupported}. */
export function isDestructiveReplacementFacadeSupported(commandKey: string): boolean {
    return isDestructiveFacadeSupported(commandKey);
}

/**
 * Tour-domain facade — exact keys only.
 * P5.S1: reschedule_tour
 * P5.S3: complete_tour, no_show_tour (alias mark_tour_no_show)
 * Owner `tour_domain` remains globally false.
 */
export const TOUR_DOMAIN_FACADE_COMMAND_KEYS = [
    "reschedule_tour",
    "complete_tour",
    "no_show_tour",
] as const;

export type TourDomainFacadeCommandKey = (typeof TOUR_DOMAIN_FACADE_COMMAND_KEYS)[number];

export function isTourDomainFacadeSupported(commandKey: string): boolean {
    const key = (commandKey ?? "").trim();
    if (!key) return false;
    const resolved = tryResolvePlatformCapability(key);
    const canonical =
        resolved.status === "known" ? resolved.capability.canonicalCommandKey : key;
    return (TOUR_DOMAIN_FACADE_COMMAND_KEYS as readonly string[]).includes(canonical);
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

    // P4.S2/S3: exact destructive/replacement allowlist (preview + commit).
    if (
        isDestructiveOrReplacementCapability(cap.canonicalCommandKey) &&
        isDestructiveFacadeSupported(cap.canonicalCommandKey)
    ) {
        return true;
    }

    // Other destructive/replacement keys remain outside the facade.
    if (isDestructiveOrReplacementCapability(cap.canonicalCommandKey)) {
        return false;
    }

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
        // move_to_waitlist is a compatibility alias of waitlist_child. Exact-key allowlist
        // alone would leave family-context Move to Waitlist on the legacy opportunity path.
        const childFacadeKey = key === "move_to_waitlist" ? "waitlist_child" : key;
        if (
            isChildEnrollmentMutationFacadeSupported(childFacadeKey) &&
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
            (RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS as readonly string[]).includes(
                cap.canonicalCommandKey
            )
        );
    }

    if (cap.executionOwner === "tour_domain") {
        return (
            isTourDomainFacadeSupported(key) &&
            (TOUR_DOMAIN_FACADE_COMMAND_KEYS as readonly string[]).includes(
                cap.canonicalCommandKey
            )
        );
    }

    return false;
}

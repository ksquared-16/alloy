/**
 * Trust command catalog adapter — the one production implementation of the
 * narrow port `lib/trust` defines.
 *
 * It lives here, with the registry it adapts, because the Operational Command
 * Runtime owns the catalog. It depends inward on both sides: the registry as a
 * value, the Trust port as a TYPE ONLY (erased at runtime), so there is no
 * cycle and no `lib/trust → lib/platform` edge in either direction.
 *
 * What it exposes to Trust is four facts and nothing else. Permissions,
 * eligibility, inputs, preview behaviour and execution all stay here and are
 * evaluated by the command runtime AFTER the Trust binding gate.
 *
 * @see lib/trust/execution/commandCatalogPort.ts
 */

import {
    getPlatformCapability,
    isExecutablePlatformCapability,
    isOrganizationCatalogCapability,
    tryResolvePlatformCapability,
} from "@/lib/platform/commands/capabilityRegistry";
import type {
    TrustCommandCatalogPort,
    TrustCommandDescription,
} from "@/lib/trust/execution/commandCatalogPort";

/**
 * Whether a capability may be proposed by a Decision Package.
 *
 * Conservative and composed from existing registry predicates rather than a new
 * axis: the command must actually be executable, and it must be a command the
 * organization's catalog already offers. A capability that is internal-only,
 * placeholder, unavailable, navigation-only or otherwise non-runnable is not
 * something reasoning may propose.
 *
 * This is the catalog owner's judgement. Trust reads the boolean and never
 * recomputes it.
 */
function acceptsTrustProposals(canonicalKey: string): boolean {
    return isExecutablePlatformCapability(canonicalKey) && isOrganizationCatalogCapability(canonicalKey);
}

/**
 * `confirmationPolicy` is the command runtime's vocabulary; Trust only needs to
 * know whether an explicit operator confirmation is demanded. `domain_owned`
 * counts as required from Trust's side: the domain will demand it, so a
 * Decision Package must arrive already confirmed rather than discovering the
 * requirement at execution time.
 */
function confirmationRequired(policy: string): boolean {
    return policy !== "none";
}

/**
 * Adapts the Platform Capability Registry into the narrow Trust port.
 *
 * Alias-tolerant: a binding may name a compatibility alias, and the description
 * reports the canonical key the runtime should actually be handed.
 */
export function createTrustCommandCatalogAdapter(): TrustCommandCatalogPort {
    return {
        key: "platform_capability_registry_v1",
        describe(commandKey: string): TrustCommandDescription | null {
            const requested = (commandKey ?? "").trim();
            if (!requested) return null;

            const resolution = tryResolvePlatformCapability(requested);
            if (resolution.status !== "known") return null;

            // Prefer the canonical entry, so an alias and its canonical key
            // describe identically.
            const definition =
                getPlatformCapability(resolution.capability.canonicalCommandKey) ?? resolution.capability;

            return {
                canonical_command_key: definition.canonicalCommandKey,
                supported_subject_types: definition.supportedSubjects,
                confirmation_required: confirmationRequired(definition.confirmationPolicy),
                accepts_trust_proposals: acceptsTrustProposals(definition.canonicalCommandKey),
                catalog_version: definition.implementationStatus ?? null,
            };
        },
    };
}

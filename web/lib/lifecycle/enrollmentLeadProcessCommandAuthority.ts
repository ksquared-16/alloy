/**
 * Enrollment Lead — bounded P6.S1 proof for Business Process command_set_v1.
 *
 * Proves authority + effective resolution without changing operator chrome.
 * Does not switch resolveCanonicalWorkTemplateActionOptions (P6.S3).
 */

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { migrateLegacyProcessCommands } from "@/lib/lifecycle/migrateLegacyProcessCommands";
import type { BusinessProcessCommandSetV1 } from "@/lib/lifecycle/processCommandSetV1";
import { resolveBusinessProcessCommandSelection } from "@/lib/lifecycle/resolveBusinessProcessCommandSelection";
import { resolveEffectiveBusinessProcessCommands } from "@/lib/lifecycle/resolveEffectiveBusinessProcessCommands";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";

/** Canonical Lead-stage Commands used for the P6.S1 behavioral equivalence proof. */
export const ENROLLMENT_LEAD_PROOF_COMMAND_KEYS = [
    "quick_message",
    "schedule_tour",
    "send_form",
    "close_lead",
] as const;

export function enrollmentLeadProofActionCatalog(): StageActionCatalogV1 {
    return {
        version: 1,
        candidate_actions: [
            { action_key: "quick_message", recommendation: "recommended" },
            { action_key: "schedule_tour", recommendation: "ready" },
            { action_key: "send_form", recommendation: "ready" },
            { action_key: "close_lead", recommendation: "context_dependent" },
        ],
    };
}

export function buildEnrollmentLeadProofProcess(input?: {
    withCommandSet?: boolean;
    commandSet?: BusinessProcessCommandSetV1;
}): LifecycleBuilderProcessRecord {
    const catalog = enrollmentLeadProofActionCatalog();
    const base: LifecycleBuilderProcessRecord = {
        id: "proof-enrollment-process",
        key: "enrollment",
        name: "Enrollment Process",
        primary_entity: "opportunity",
        sort_order: 0,
        is_active: true,
        stages: [
            {
                id: "proof-lead-stage",
                key: "lead",
                label: "Lead",
                sort_order: 0,
                is_active: true,
                action_catalog_v1: catalog,
            },
            {
                id: "proof-tour-stage",
                key: "tour",
                label: "Tour",
                sort_order: 1,
                is_active: true,
                action_catalog_v1: {
                    version: 1,
                    candidate_actions: [
                        { action_key: "confirm_tour", recommendation: "recommended" },
                        { action_key: "reschedule_tour", recommendation: "ready" },
                    ],
                },
            },
        ],
    };

    if (input?.commandSet) {
        return { ...base, command_set_v1: input.commandSet };
    }

    if (input?.withCommandSet) {
        const migrated = migrateLegacyProcessCommands({ process: base });
        return { ...base, command_set_v1: migrated.commands };
    }

    return base;
}

/**
 * Proof: attaching derived command_set_v1 preserves the same enabled canonical keys
 * as legacy compatibility for the same process.
 */
export function proveEnrollmentLeadCommandSetEquivalence(): {
    legacyKeys: string[];
    v1Keys: string[];
    equivalent: boolean;
    authorityWithV1: string;
    authorityWithoutV1: string;
} {
    const without = buildEnrollmentLeadProofProcess();
    const legacy = resolveBusinessProcessCommandSelection({ process: without });
    const withV1 = buildEnrollmentLeadProofProcess({ withCommandSet: true });
    const v1 = resolveBusinessProcessCommandSelection({ process: withV1 });

    const legacyKeys = legacy.commands.commands
        .filter((c) => c.enabled)
        .map((c) => c.capability_key)
        .sort();
    const v1Keys = v1.commands.commands
        .filter((c) => c.enabled)
        .map((c) => c.capability_key)
        .sort();

    return {
        legacyKeys,
        v1Keys,
        equivalent: JSON.stringify(legacyKeys) === JSON.stringify(v1Keys),
        authorityWithV1: v1.authority,
        authorityWithoutV1: legacy.authority,
    };
}

export function resolveEnrollmentLeadEffectiveProof() {
    const process = buildEnrollmentLeadProofProcess({ withCommandSet: true });
    return resolveEffectiveBusinessProcessCommands({
        process,
        stageKey: "lead",
    });
}

/**
 * Process runtime Command projection (P6.S2).
 *
 * Thin, domain-neutral projection over resolveEffectiveBusinessProcessCommands.
 * Consumers may format results; they must not recreate process selection authority.
 *
 * Ordering:
 *   1. process command_set_v1 / legacy migrate order
 *   2. stage recommendation order for stage-presented subsets
 *   3. canonical key tie-breaker
 */

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import {
    resolveEffectiveBusinessProcessCommands,
    type EffectiveBusinessProcessCommand,
    type EffectiveBusinessProcessCommandResolution,
    type OrganizationCommandCatalogLookup,
} from "@/lib/lifecycle/resolveEffectiveBusinessProcessCommands";
import type { BusinessProcessCommandSelectionAuthority } from "@/lib/lifecycle/resolveBusinessProcessCommandSelection";
import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";

export type ProcessRuntimeCommandProjectionRow = {
    capabilityKey: string;
    canonicalCapabilityKey: string;
    selected: boolean;
    stageRecommended: boolean;
    stageRequired: boolean;
    runnable: boolean;
    blockedReasons: readonly string[];
    requiresSubject: boolean;
    requiresInputs: boolean;
    authorization: "deferred_to_invocation";
};

export type ProcessRuntimeCommandProjection = {
    authority: BusinessProcessCommandSelectionAuthority;
    processId: string;
    processKey: string;
    stageKey: string | null;
    /** True when command_set_v1 is present (including explicit empty). */
    commandSetPresent: boolean;
    /** Enforce empty allowlists (no unrestricted fallback). */
    enforceAllowlist: boolean;
    commands: readonly ProcessRuntimeCommandProjectionRow[];
    /** Enabled process-selected keys in process order (+ intent aliases). */
    selectedEnabledKeys: ReadonlySet<string>;
    /** Stage-recommended among selected (presentation order). */
    stageRecommendedKeys: readonly string[];
    stageOrphanKeys: readonly string[];
    runnableKeys: readonly string[];
    diagnostics: readonly { code: string; message: string }[];
    /** Raw effective resolution for advanced consumers. */
    effective: EffectiveBusinessProcessCommandResolution;
};

function toRow(cmd: EffectiveBusinessProcessCommand): ProcessRuntimeCommandProjectionRow {
    const blocked = [...cmd.reasons].filter((r) => r !== "authorization_deferred_to_invocation");
    if (cmd.invocationReadiness !== "runnable") {
        blocked.push(`readiness_${cmd.invocationReadiness}`);
    }
    return {
        capabilityKey: cmd.requestedKey,
        canonicalCapabilityKey: cmd.canonicalCapabilityKey,
        selected: cmd.processSelected && cmd.processEnabled,
        stageRecommended: cmd.stageRecommended,
        stageRequired: cmd.stageRequired,
        runnable: cmd.invocationReadiness === "runnable",
        blockedReasons: blocked,
        requiresSubject: cmd.invocationReadiness === "requires_subject",
        requiresInputs: cmd.invocationReadiness === "requires_inputs",
        authorization: "deferred_to_invocation",
    };
}

function expandKeyAliases(keys: Iterable<string>): Set<string> {
    const out = new Set<string>();
    for (const key of keys) {
        const trimmed = key.trim();
        if (!trimmed) continue;
        out.add(trimmed);
        out.add(normalizeActionRefToIntentKey(trimmed));
    }
    return out;
}

/**
 * Canonical runtime projection for process/stage Command consumption.
 * Side-effect free.
 */
export function projectProcessRuntimeCommands(input: {
    process: LifecycleBuilderProcessRecord;
    stageKey?: string | null;
    stageActionCatalog?: StageActionCatalogV1 | null;
    lifecycleConfiguredActions?: readonly LifecycleConfiguredActionRow[] | null;
    organizationCommandCatalog?: OrganizationCommandCatalogLookup | null;
    operationalContext?: string | null;
}): ProcessRuntimeCommandProjection {
    const effective = resolveEffectiveBusinessProcessCommands({
        process: input.process,
        stageKey: input.stageKey,
        stageActionCatalog: input.stageActionCatalog,
        lifecycleConfiguredActions: input.lifecycleConfiguredActions,
        organizationCommandCatalog: input.organizationCommandCatalog,
        operationalContext: input.operationalContext,
    });

    const commandSetPresent = input.process.command_set_v1 != null;
    const rows = effective.commands.map(toRow);

    const selectedEnabled = rows
        .filter((r) => r.selected)
        .map((r) => r.canonicalCapabilityKey);

    const stageRecommendedKeys = rows
        .filter((r) => r.selected && r.stageRecommended)
        .map((r) => r.canonicalCapabilityKey);

    const runnableKeys = rows.filter((r) => r.runnable).map((r) => r.canonicalCapabilityKey);

    const diagnostics = [
        ...effective.diagnostics,
        {
            code: "runtime_projection",
            message: `process=${effective.processKey} authority=${effective.authority} selected=${selectedEnabled.length} command_set_present=${commandSetPresent}`,
        },
    ];

    if (effective.authority === "legacy_compatibility") {
        diagnostics.push({
            code: "legacy_runtime_consumer",
            message: `consumer=process_runtime_projection process=${effective.processKey}`,
        });
    }

    return {
        authority: effective.authority,
        processId: effective.processId,
        processKey: effective.processKey,
        stageKey: effective.stageKey,
        commandSetPresent,
        enforceAllowlist: commandSetPresent,
        commands: rows,
        selectedEnabledKeys: expandKeyAliases(selectedEnabled),
        stageRecommendedKeys,
        stageOrphanKeys: effective.stageOrphans.map((o) => o.canonicalCapabilityKey),
        runnableKeys,
        diagnostics,
        effective,
    };
}

/**
 * Current Work / stage allowlist: process-selected ∩ stage catalog (+ explicit template refs).
 * Stage catalog alone cannot introduce selection. Explicit WT refs retained until P6.S3.
 */
export function buildProcessAwareActionAllowlist(input: {
    projection: ProcessRuntimeCommandProjection | null | undefined;
    stageActionCatalog?: StageActionCatalogV1 | null;
    explicitTemplateRefs?: readonly string[] | null;
}): {
    keys: ReadonlySet<string>;
    enforce: boolean;
} {
    const keys = new Set<string>();
    const projection = input.projection;

    if (projection) {
        for (const candidate of input.stageActionCatalog?.candidate_actions ?? []) {
            const key = candidate.action_key.trim();
            if (!key) continue;
            const intent = normalizeActionRefToIntentKey(key);
            if (
                projection.selectedEnabledKeys.has(key) ||
                projection.selectedEnabledKeys.has(intent)
            ) {
                keys.add(key);
                keys.add(intent);
            }
        }
        // Explicit authored Work Template refs remain until P6.S3 writer switch.
        for (const ref of input.explicitTemplateRefs ?? []) {
            const key = ref?.trim();
            if (!key) continue;
            keys.add(key);
            keys.add(normalizeActionRefToIntentKey(key));
        }
        return { keys, enforce: projection.enforceAllowlist };
    }

    // No process projection — preserve pre-P6.S2 catalog ∪ template union.
    for (const candidate of input.stageActionCatalog?.candidate_actions ?? []) {
        const key = candidate.action_key.trim();
        if (!key) continue;
        keys.add(key);
        keys.add(normalizeActionRefToIntentKey(key));
    }
    for (const ref of input.explicitTemplateRefs ?? []) {
        const key = ref?.trim();
        if (!key) continue;
        keys.add(key);
        keys.add(normalizeActionRefToIntentKey(key));
    }
    return { keys, enforce: false };
}

/** Filter stage catalog candidates to process-selected keys only. */
export function filterStageCatalogToProcessSelection(
    catalog: StageActionCatalogV1 | null | undefined,
    projection: ProcessRuntimeCommandProjection | null | undefined
): StageActionCatalogV1 | null {
    if (!catalog) return null;
    if (!projection) return catalog;
    return {
        version: 1,
        candidate_actions: catalog.candidate_actions.filter((row) => {
            const key = row.action_key.trim();
            if (!key) return false;
            return (
                projection.selectedEnabledKeys.has(key) ||
                projection.selectedEnabledKeys.has(normalizeActionRefToIntentKey(key))
            );
        }),
    };
}

export function isProcessSelectedCapability(
    projection: ProcessRuntimeCommandProjection | null | undefined,
    capabilityKey: string
): boolean {
    if (!projection) return true; // no process context → do not invent a gate
    const key = capabilityKey.trim();
    if (!key) return false;
    return (
        projection.selectedEnabledKeys.has(key) ||
        projection.selectedEnabledKeys.has(normalizeActionRefToIntentKey(key))
    );
}

/**
 * Deterministic legacy → process Command selection migration (P6.S1).
 *
 * When `command_set_v1` is absent, one compatibility set is produced from a single
 * ordered union — not several equal authorities at resolve time.
 *
 * Precedence within legacy migration (documented; not silent multi-authority):
 *   1. Stage action_catalog_v1.candidate_actions (all stages, process order)
 *   2. Lifecycle-builder configured registry keys (when provided)
 *
 * LIFECYCLE_BASE_ACTIONS and ENROLLMENT_STAGE_ACTION_KEYS are NOT merged here —
 * they remain editor seed lists, not process selection authorities.
 */

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import {
    emptyProcessCommandSetV1,
    type BusinessProcessCommandSetV1,
} from "@/lib/lifecycle/processCommandSetV1";

export type LegacyProcessCommandMigrationSource =
    | "stage_action_catalog_v1"
    | "lifecycle_builder_placements";

export type LegacyProcessCommandMigrationResult = {
    commands: BusinessProcessCommandSetV1;
    /** Ordered unique sources that contributed at least one key. */
    sources: readonly LegacyProcessCommandMigrationSource[];
    /** Keys contributed, for diagnostics. */
    contributedKeys: Readonly<Record<LegacyProcessCommandMigrationSource, readonly string[]>>;
};

function trimKey(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

function collectBuilderPlacementKeys(
    registry: readonly LifecycleConfiguredActionRow[] | null | undefined
): string[] {
    if (!registry?.length) return [];
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const row of registry) {
        const key = trimKey(row.key);
        if (!key || seen.has(key)) continue;
        const scoped =
            row.action_scope === "lifecycle" ||
            (Array.isArray(row.operator_stages) && row.operator_stages.length > 0);
        if (!scoped) continue;
        seen.add(key);
        keys.push(key);
    }
    return keys;
}

/**
 * Build one compatibility `command_set_v1` from legacy process configuration.
 * Does not read LIFECYCLE_BASE_ACTIONS (UI seed only).
 */
export function migrateLegacyProcessCommands(input: {
    process: LifecycleBuilderProcessRecord;
    /** Optional builder-configured placement rows for this org/process. */
    lifecycleConfiguredActions?: readonly LifecycleConfiguredActionRow[] | null;
}): LegacyProcessCommandMigrationResult {
    const stageKeys: string[] = [];
    const stageSeen = new Set<string>();
    for (const stage of input.process.stages ?? []) {
        for (const row of stage.action_catalog_v1?.candidate_actions ?? []) {
            const key = trimKey(row.action_key);
            if (!key || stageSeen.has(key)) continue;
            stageSeen.add(key);
            stageKeys.push(key);
        }
    }

    const placementKeys = collectBuilderPlacementKeys(input.lifecycleConfiguredActions);
    const commands = emptyProcessCommandSetV1();
    const seen = new Set<string>();
    const sources: LegacyProcessCommandMigrationSource[] = [];

    const push = (key: string) => {
        if (seen.has(key)) return;
        seen.add(key);
        commands.commands.push({ capability_key: key, enabled: true });
    };

    for (const key of stageKeys) push(key);
    for (const key of placementKeys) push(key);

    if (stageKeys.length) sources.push("stage_action_catalog_v1");
    if (placementKeys.length) sources.push("lifecycle_builder_placements");

    return {
        commands,
        sources,
        contributedKeys: {
            stage_action_catalog_v1: stageKeys,
            lifecycle_builder_placements: placementKeys,
        },
    };
}

/**
 * Ensure process `command_set_v1` on Business Process saves (P6.S3).
 *
 * - Absent V1 → stamp from deterministic legacy migrate (no UX change).
 * - Present V1 → maintain; optionally upsert newly seen stage-catalog keys as enabled.
 * - Never replace an explicit empty V1 with legacy fallback.
 */

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import { migrateLegacyProcessCommands } from "@/lib/lifecycle/migrateLegacyProcessCommands";
import {
    listEnabledCommandKeys,
    type BusinessProcessCommandSetV1,
} from "@/lib/lifecycle/processCommandSetV1";
import { tryResolvePlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";

function resolveCanon(key: string): string {
    const resolved = tryResolvePlatformCapability(key);
    if (resolved.status === "known") return resolved.capability.canonicalCommandKey;
    return key.trim();
}

function upsertMissingCatalogKeys(
    existing: BusinessProcessCommandSetV1,
    process: LifecycleBuilderProcessRecord
): BusinessProcessCommandSetV1 {
    const enabled = new Set(listEnabledCommandKeys(existing, resolveCanon));
    const disabled = new Set(
        existing.commands
            .filter((c) => !c.enabled)
            .map((c) => resolveCanon(c.capability_key))
            .filter(Boolean)
    );
    const next: BusinessProcessCommandSetV1 = {
        version: 1,
        commands: [...existing.commands],
    };
    for (const stage of process.stages ?? []) {
        for (const row of stage.action_catalog_v1?.candidate_actions ?? []) {
            const key = row.action_key.trim();
            if (!key) continue;
            const canon = resolveCanon(key);
            if (!canon || enabled.has(canon) || disabled.has(canon)) continue;
            // Also skip if already present under any alias form.
            if (
                next.commands.some(
                    (c) => resolveCanon(c.capability_key) === canon
                )
            ) {
                continue;
            }
            next.commands.push({ capability_key: canon, enabled: true });
            enabled.add(canon);
        }
    }
    return next;
}

/**
 * Stamp or maintain command_set_v1 on a single process.
 */
export function ensureProcessCommandSetV1OnSave(
    process: LifecycleBuilderProcessRecord,
    opts?: {
        lifecycleConfiguredActions?: readonly LifecycleConfiguredActionRow[] | null;
        /** When true and V1 present, append newly seen stage catalog keys. Default true. */
        upsertFromStageCatalogs?: boolean;
    }
): LifecycleBuilderProcessRecord {
    if (process.command_set_v1) {
        if (opts?.upsertFromStageCatalogs === false) {
            return process;
        }
        // Explicit empty remains intentional — do not migrate-fill.
        if (process.command_set_v1.commands.length === 0) {
            return process;
        }
        const maintained = upsertMissingCatalogKeys(process.command_set_v1, process);
        return { ...process, command_set_v1: maintained };
    }

    const migrated = migrateLegacyProcessCommands({
        process,
        lifecycleConfiguredActions: opts?.lifecycleConfiguredActions,
    });
    /**
     * A migration that found nothing to migrate must leave the section ABSENT.
     *
     * Stamping `{ version: 1, commands: [] }` here converts "nobody has selected commands yet" into
     * "the operator selected none" — and the guard above then treats that as intentional forever.
     * The two states are not the same to any reader: `validateProcessCommandSetsForPublish` skips an
     * absent section and reports every Work Template action as un-selected against an empty one.
     *
     * That is exactly what happened to the certification tenant. Both migration inputs were empty —
     * no stage carries `action_catalog_v1`, and the save path passes no configured-action rows — so
     * the first save of the packet selection stamped an empty set and turned a clean draft into
     * eleven "not process-selected" errors, without anyone choosing anything. Presence is authority
     * here for the same reason it is for `requirements_v1` (D-90).
     */
    if (!migrated.commands.commands.length) return process;
    return { ...process, command_set_v1: migrated.commands };
}

/**
 * Apply ensureProcessCommandSetV1OnSave to every process in a builder config.
 */
export function ensureBuilderCommandSetsOnSave(
    config: LifecycleBuilderV1,
    opts?: {
        lifecycleConfiguredActions?: readonly LifecycleConfiguredActionRow[] | null;
        upsertFromStageCatalogs?: boolean;
    }
): LifecycleBuilderV1 {
    return {
        ...config,
        processes: config.processes.map((p) => ensureProcessCommandSetV1OnSave(p, opts)),
    };
}

/**
 * Has this process restricted itself to a set of commands, and is this one of them?
 *
 * Three states, and the middle one used to be read as the last:
 *
 *   absent      no selection has been authored → NO restriction. Everything otherwise valid passes.
 *   `[]`        the operator deliberately selected none → nothing passes.
 *   populated   only what was selected passes.
 *
 * Absence used to fall through to `migrateLegacyProcessCommands`, which in a tenant with no stage
 * action catalogs returns an empty list — so "nobody has chosen yet" denied every capability, and the
 * Direct Command and Helpful Action pickers rendered empty with nothing wrong with the configuration.
 * The publish validator had always read absence the other way and skipped it entirely, so the two
 * canonical readers disagreed about the same fact. The guard even disagreed with itself: a null
 * PROCESS returned unrestricted while a process with no selection returned fully restricted.
 *
 * The migration is still consulted, because a legacy process that never wrote `command_set_v1` can
 * still have a real selection derivable from its stage catalogs. What changed is what an EMPTY
 * derivation means: nothing was authored, so nothing is restricted.
 */
export function isCapabilityInProcessSelection(
    process: LifecycleBuilderProcessRecord | null | undefined,
    capabilityKey: string
): boolean {
    if (!process) return true;
    // Explicit empty is authoritative and must keep denying — only ABSENCE is permissive.
    if (!process.command_set_v1) {
        const derived = migrateLegacyProcessCommands({ process }).commands;
        if (!listEnabledCommandKeys(derived, resolveCanon).length) return true;
    }
    const selectionKeys = listEnabledCommandKeys(
        process.command_set_v1 ??
            migrateLegacyProcessCommands({ process }).commands,
        resolveCanon
    );
    const want = resolveCanon(capabilityKey);
    const intent = normalizeActionRefToIntentKey(capabilityKey);
    return (
        selectionKeys.includes(want) ||
        selectionKeys.includes(intent) ||
        selectionKeys.some((k) => normalizeActionRefToIntentKey(k) === intent)
    );
}

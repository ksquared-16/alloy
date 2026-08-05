/**
 * Configured Stage Referential Integrity — the ONE authoritative stage vocabulary at runtime.
 *
 * Product doctrine: a stage may exist only when it is explicitly present in the current
 * configured Business Process. Built-in lists, templates, migrations, fallbacks, test fixtures
 * and legacy constants must NEVER make a stage valid at runtime.
 *
 * The runtime contract for any referenced stage:
 *
 *   referenced stage → resolve current Business Process → verify stage membership
 *     → execute only if present
 *
 * Absent → configuration error (no write, no partial transaction, no UI transition, clear
 * explanation). This module is the single source every layer consults: stage validity,
 * the canonical stage-move writer, and publish-time referential integrity.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    configuredStageKeysForMetadata,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

export type ConfiguredStageInventory = {
    /** True when the department has an active configured Business Process at all. */
    hasConfiguredProcess: boolean;
    /** The active process key, when configured. */
    processKey: string | null;
    /** The ONLY stage keys valid at runtime for this department. */
    stageKeys: string[];
    /**
     * Declared journey grain per configured stage, as the department metadata states it.
     *
     * Carried here — rather than resolved here — because this metadata is only ONE of the three
     * sources that answer "what grain is this stage", and on Firefly's Decision stage it is the
     * one that disagrees. `resolveStageGrain` weighs it against the others; this module's job is
     * to hand it over unedited.
     */
    stageGrainsByKey: Record<string, string>;
};

/**
 * A stage was referenced that is not part of the configured Business Process. This is a
 * configuration error, never a runtime write. Carries enough for a clear operator/admin
 * explanation and correlation.
 */
export type StageConfigurationError = {
    kind: "stage_not_configured";
    stage_key: string;
    /** The stages that ARE configured, so the message can name the valid set. */
    configured_stages: string[];
    process_key: string | null;
    message: string;
};

export function configuredStageInventoryFromMetadata(metadata: unknown): ConfiguredStageInventory {
    const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(metadata));
    const stageGrainsByKey: Record<string, string> = {};
    if (process) {
        for (const stage of activeStagesForProcess(process)) {
            const grain = (stage as { grain?: unknown }).grain;
            if (typeof grain === "string" && grain.trim()) stageGrainsByKey[stage.key] = grain.trim();
        }
    }
    return {
        hasConfiguredProcess: process != null,
        processKey: process?.key ?? null,
        stageKeys: configuredStageKeysForMetadata(metadata),
        stageGrainsByKey,
    };
}

/** Membership check against a resolved inventory — the authoritative predicate. */
export function isStageInConfiguredInventory(inventory: ConfiguredStageInventory, stageKey: string): boolean {
    const key = stageKey.trim();
    if (!key) return false;
    return inventory.stageKeys.includes(key);
}

export function stageConfigurationError(
    inventory: ConfiguredStageInventory,
    stageKey: string,
): StageConfigurationError {
    const key = stageKey.trim();
    return {
        kind: "stage_not_configured",
        stage_key: key,
        configured_stages: inventory.stageKeys,
        process_key: inventory.processKey,
        message:
            `Stage "${key}" is not part of the configured Business Process` +
            (inventory.processKey ? ` "${inventory.processKey}"` : "") +
            `. Configured stages: ${inventory.stageKeys.length ? inventory.stageKeys.join(", ") : "(none)"}. ` +
            `This is a configuration error — no change was made.`,
    };
}

/**
 * Assert a stage is in the configured inventory. Returns the error object (not thrown) so the
 * canonical writer can turn it into a transaction abort with `changed: false`.
 */
export function assertStageConfigured(
    inventory: ConfiguredStageInventory,
    stageKey: string,
): { ok: true } | { ok: false; error: StageConfigurationError } {
    if (isStageInConfiguredInventory(inventory, stageKey)) return { ok: true };
    return { ok: false, error: stageConfigurationError(inventory, stageKey) };
}

/**
 * Load the configured stage inventory for a department from its metadata. This is the read the
 * canonical writer performs before any stage move — the runtime never trusts a built-in list.
 */
export async function loadConfiguredStageInventory(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
): Promise<ConfiguredStageInventory> {
    const { data } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    const metadata =
        data?.metadata != null && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : {};
    return configuredStageInventoryFromMetadata(metadata);
}

/**
 * Placement priority config (Card 4) — validates `metadata.placement_priority_v1` JSON.
 * Does not wire QueueService; presets resolved via {@link getPlacementProfileFromRegistry}.
 */

import { z } from "zod";

export const PLACEMENT_PRIORITY_CONFIG_VERSION = 1 as const;

/** Max in-memory rows evaluated per queue request when placement sort is applied (future QueueService). */
export const PLACEMENT_EVALUATION_CAP_MAX = 5000;
export const PLACEMENT_EVALUATION_CAP_DEFAULT = 800;

export const missingFactBehaviorSchema = z.enum(["inherit", "strict", "soft"]);

/** Evaluator / queue projection engine — distinct from layer `version` (config schema revision). */
export const placementEngineVersionSchema = z.enum(["v1", "v2"]);
export type PlacementEngineVersion = z.infer<typeof placementEngineVersionSchema>;

export const placementPriorityDisplayConfigSchema = z
    .object({
        show_bucket_chip: z.boolean().optional(),
        show_sort_hint: z.boolean().optional(),
    })
    .strict();

/**
 * Single metadata layer (department or work unit). Omitted fields do not override deeper defaults.
 */
export const placementPriorityLayerSchema = z
    .object({
        version: z.literal(PLACEMENT_PRIORITY_CONFIG_VERSION),
        /** Default false when layer missing — effective merge sets disabled unless explicitly enabled. */
        enabled: z.boolean().optional(),
        /**
         * Placement evaluator engine (`v1` = opportunity-only, `v2` = placement_candidates + family rollup).
         * Omitted → `v1` when enabled.
         */
        engine_version: placementEngineVersionSchema.optional(),
        profile_id: z.string().min(1).optional(),
        /** Pin to a preset revision; mismatch with registry preset emits resolve warning (future). */
        profile_revision: z.string().min(1).optional(),
        /** When set, placement applies only to these queue keys (lane opt-in). */
        queue_keys_enabled: z.array(z.string().min(1)).nonempty().optional(),
        /** Compare placement ordering without affecting primary sort (future QueueService). */
        shadow_mode: z.boolean().optional(),
        /** Cap for candidate rows when recomputing order server-side. */
        evaluation_cap: z.number().int().positive().max(PLACEMENT_EVALUATION_CAP_MAX).optional(),
        missing_fact_behavior: missingFactBehaviorSchema.optional(),
        display: placementPriorityDisplayConfigSchema.optional(),
        /**
         * Ordered bucket keys for this profile — full permutation; last must match preset `fallback_bucket_key`.
         * When omitted, registry preset order applies.
         */
        priority_rule_order: z.array(z.string().min(1)).min(2).max(24).optional(),
        /**
         * Bucket keys whose matcher rules are **active**; omitted = all tiers in `priority_rule_order` active.
         * Must include `fallback_bucket_key`; unknown keys rejected. Disabled tiers never match.
         */
        priority_rule_enabled_keys: z.array(z.string().min(1)).max(24).optional(),
    })
    .strict();

export type PlacementPriorityLayer = z.infer<typeof placementPriorityLayerSchema>;

const METADATA_KEY = "placement_priority_v1" as const;

function readLayer(metadata: unknown): unknown {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
    return (metadata as Record<string, unknown>)[METADATA_KEY];
}

export function parsePlacementPriorityLayer(metadata: unknown): PlacementPriorityLayer | null {
    const raw = readLayer(metadata);
    if (raw == null || raw === undefined) return null;
    const p = placementPriorityLayerSchema.safeParse(raw);
    return p.success ? p.data : null;
}

export type PlacementPriorityParseIssue = { path: string; message: string };

/**
 * Strict parse for admin writes / debugging — surfaces Zod issues.
 * When the metadata key is **omitted**, returns **`value: null`** (valid — layer inactive).
 */
export function parsePlacementPriorityLayerStrict(
    metadata: unknown
): { ok: true; value: PlacementPriorityLayer | null } | { ok: false; issues: PlacementPriorityParseIssue[] } {
    const raw = readLayer(metadata);
    if (raw == null) {
        return { ok: true, value: null };
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, issues: [{ path: METADATA_KEY, message: "must be an object when present" }] };
    }
    const p = placementPriorityLayerSchema.safeParse(raw);
    if (!p.success) {
        return {
            ok: false,
            issues: p.error.issues.map((i) => ({
                path: i.path.join(".") || METADATA_KEY,
                message: i.message,
            })),
        };
    }
    return { ok: true, value: p.data };
}

export type MergedPlacementPriorityConfig = {
    enabled: boolean;
    engine_version: PlacementEngineVersion;
    profile_id: string | null;
    profile_revision: string | null;
    queue_keys_enabled: string[] | null;
    shadow_mode: boolean;
    evaluation_cap: number;
    missing_fact_behavior: z.infer<typeof missingFactBehaviorSchema>;
    display: z.infer<typeof placementPriorityDisplayConfigSchema> | null;
    /** When set, overrides rule evaluation + bucket sort weights for this work unit (see placementPriorityRuleOrder). */
    priority_rule_order: string[] | null;
    /** Subset of `priority_rule_order` keys with active matcher rules; always includes fallback when set. */
    priority_rule_enabled_keys: string[] | null;
};

const DEFAULT_MERGED: MergedPlacementPriorityConfig = {
    enabled: false,
    engine_version: "v1",
    profile_id: null,
    profile_revision: null,
    queue_keys_enabled: null,
    shadow_mode: false,
    evaluation_cap: PLACEMENT_EVALUATION_CAP_DEFAULT,
    missing_fact_behavior: "inherit",
    display: null,
    priority_rule_order: null,
    priority_rule_enabled_keys: null,
};

function mergeLayer(base: MergedPlacementPriorityConfig, layer: PlacementPriorityLayer | null): MergedPlacementPriorityConfig {
    if (!layer) return base;
    return {
        enabled: layer.enabled !== undefined ? layer.enabled : base.enabled,
        engine_version: layer.engine_version !== undefined ? layer.engine_version : base.engine_version,
        profile_id: layer.profile_id !== undefined ? layer.profile_id : base.profile_id,
        profile_revision: layer.profile_revision !== undefined ? layer.profile_revision : base.profile_revision,
        queue_keys_enabled:
            layer.queue_keys_enabled !== undefined ? [...layer.queue_keys_enabled] : base.queue_keys_enabled,
        shadow_mode: layer.shadow_mode !== undefined ? layer.shadow_mode : base.shadow_mode,
        evaluation_cap: layer.evaluation_cap !== undefined ? layer.evaluation_cap : base.evaluation_cap,
        missing_fact_behavior:
            layer.missing_fact_behavior !== undefined ? layer.missing_fact_behavior : base.missing_fact_behavior,
        display: layer.display !== undefined ? layer.display ?? null : base.display,
        priority_rule_order:
            layer.priority_rule_order !== undefined
                ? layer.priority_rule_order
                    ? [...layer.priority_rule_order]
                    : null
                : base.priority_rule_order,
        priority_rule_enabled_keys:
            layer.priority_rule_enabled_keys !== undefined
                ? layer.priority_rule_enabled_keys
                    ? [...layer.priority_rule_enabled_keys]
                    : null
                : base.priority_rule_enabled_keys,
    };
}

/**
 * Merge department then work unit layer — **work unit wins** on every overlapping field.
 */
export function mergePlacementPriorityLayers(
    departmentMetadata: unknown,
    workUnitMetadata: unknown
): MergedPlacementPriorityConfig {
    let m = { ...DEFAULT_MERGED };
    m = mergeLayer(m, parsePlacementPriorityLayer(departmentMetadata));
    m = mergeLayer(m, parsePlacementPriorityLayer(workUnitMetadata));
    return m;
}

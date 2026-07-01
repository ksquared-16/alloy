import type { AlloyVisualFamily, VisualContextKey, VisualContextRegistryEntry } from "./types";

/** Canonical neutral context — safe fallback for non-contextual routes. */
export const NEUTRAL_CONTEXT_KEY = "neutral" as const;

/**
 * Operational / semantic contexts only — not department brands.
 * Each maps to one Alloy visual family (see `contextStyle.ts`).
 */
export const VISUAL_CONTEXT_REGISTRY: Record<string, VisualContextRegistryEntry> = {
    [NEUTRAL_CONTEXT_KEY]: { alloyFamily: "neutral" },

    /** Lane / work — calendar-day visits */
    scheduled_today: { alloyFamily: "alloy_blue" },
    unassigned: { alloyFamily: "amber", amberEmphasis: "standard" },
    needs_attention: { alloyFamily: "amber", amberEmphasis: "strong" },

    /** Coordination / flow — default “ops” feel without department naming */
    coordination: { alloyFamily: "bend_pine" },

    /** Department-default semantics (not org names): forward motion / pipeline */
    momentum: { alloyFamily: "alloy_blue" },
    hospitality: { alloyFamily: "amber", amberEmphasis: "standard" },
    steadiness: { alloyFamily: "midnight_blue" },
};

/** Lane keys (queue mode) → semantic context key (priority 2). */
export const LANE_KEY_TO_VISUAL_CONTEXT: Record<string, VisualContextKey> = {
    scheduled_today: "scheduled_today",
    unassigned: "unassigned",
    needs_attention: "needs_attention",
};

/**
 * Department `key` → default *semantic* context (fallback before neutral).
 * These are operational defaults, not “department color branding”.
 */
export const DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT: Record<string, VisualContextKey> = {
    operations: "coordination",
    finance: "neutral",
    growth: "momentum",
    customer_experience: "hospitality",
    system: "neutral",
    revenue: "momentum",
    team: "neutral",
};

/**
 * Legacy / stored keys that may appear in URLs or older payloads → semantic context.
 */
export const VISUAL_CONTEXT_KEY_ALIASES: Record<string, VisualContextKey> = {
    operations: "coordination",
    schedule_today: "scheduled_today",
    needs_attention_lane: "needs_attention",
    unassigned_lane: "unassigned",
};

export function isRegisteredVisualContextKey(key: string): key is VisualContextKey {
    return Object.prototype.hasOwnProperty.call(VISUAL_CONTEXT_REGISTRY, key);
}

export function getRegistryEntry(key: string): VisualContextRegistryEntry {
    return VISUAL_CONTEXT_REGISTRY[key] ?? VISUAL_CONTEXT_REGISTRY[NEUTRAL_CONTEXT_KEY];
}

export function alloyFamilyForContextKey(key: string): AlloyVisualFamily {
    return getRegistryEntry(key).alloyFamily;
}

/** @deprecated Use `alloyFamilyForContextKey` */
export function accentFamilyForContextKey(key: string): AlloyVisualFamily {
    return alloyFamilyForContextKey(key);
}

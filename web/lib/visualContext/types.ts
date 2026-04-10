/**
 * Alloy palette roles only (confirmed tokens in `styles/tokens/colors.ts`).
 * No off-brand or red semantic families.
 */
export type AlloyVisualFamily = "alloy_blue" | "bend_pine" | "amber" | "midnight_blue" | "neutral";

/** @deprecated Use `AlloyVisualFamily` — kept for incremental renames. */
export type VisualAccentFamily = AlloyVisualFamily;

/**
 * Stable operational visual identity — values are registered in `contextRegistry.ts`.
 */
export type VisualContextKey = string;

/** Serializable hints for the resolver (drawer stack, URL hydration, etc.). */
export type OperationalVisualContext = {
    /** Priority 1 — explicit operational context (e.g. route or feature flag). */
    visualContextKey?: string | null;
    /** Priority 2 — lane mode (e.g. `scheduled_today`). */
    laneKey?: string | null;
    /** Priority 3 — work unit config when present. */
    workUnitVisualContextKey?: string | null;
    /** Priority 4 — department default from org config when wired. */
    departmentDefaultVisualContextKey?: string | null;
    /** Fallback — `departments.key` maps to a default *semantic* context (not department branding). */
    departmentKey?: string | null;
};

/** Everything except `layer` — passed to shell / record style builders. */
export type VisualContextResolveHints = OperationalVisualContext;

export type VisualContextLayer = "workspace" | "department" | "work_unit" | "record";

/** Stronger Amber for `needs_attention` — still Alloy Juniper Ember / boundary-amber grammar, not red. */
export type AmberEmphasis = "standard" | "strong";

export type VisualContextRegistryEntry = {
    alloyFamily: AlloyVisualFamily;
    /** Only used when `alloyFamily === "amber"` — boosts mix strength slightly. */
    amberEmphasis?: AmberEmphasis;
};

export type ResolvedVisualContext = {
    contextKey: VisualContextKey;
    alloyFamily: AlloyVisualFamily;
    amberEmphasis?: AmberEmphasis;
};

/** Unified input for token merge + shells (layer + resolver hints). */
export type OperationalVisualStyleInput = VisualContextResolveHints & {
    layer: VisualContextLayer;
};

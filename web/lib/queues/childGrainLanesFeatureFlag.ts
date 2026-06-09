/**
 * Feature flag for Phase 6 child/candidate queue lane builders (Phase A).
 *
 * Set `ALLOY_QUEUE_CHILD_GRAIN_LANES` to enable builders for specific queue keys.
 * Unset or empty → legacy queue runtime (default production).
 *
 * @see docs/sprints/06_2026/child_grain_queue_conversion_design.md §8 Phase A
 */

/** Queue keys that Phase A OCM builders may serve when flag-enabled. */
export const CHILD_GRAIN_LANE_BUILDER_QUEUE_KEYS = [
    "tours",
    "tours_follow_up",
    "enrollment_offers",
    "enrollment_completed",
    "waitlist",
] as const;

export type ChildGrainLaneBuilderQueueKey = (typeof CHILD_GRAIN_LANE_BUILDER_QUEUE_KEYS)[number];

const CHILD_GRAIN_LANE_KEY_SET = new Set<string>(CHILD_GRAIN_LANE_BUILDER_QUEUE_KEYS);

function parseChildGrainLanesEnv(): Set<string> | null {
    const raw = process.env.ALLOY_QUEUE_CHILD_GRAIN_LANES;
    if (raw == null) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (trimmed === "1" || trimmed.toLowerCase() === "true" || trimmed.toLowerCase() === "all") {
        return new Set(CHILD_GRAIN_LANE_BUILDER_QUEUE_KEYS);
    }

    const keys = trimmed
        .split(/[,;\s]+/)
        .map((k) => k.trim())
        .filter(Boolean);
    return new Set(keys);
}

/** Env snapshot for tests — call before/after with explicit value. */
export function readChildGrainLanesEnabledKeysFromEnv(): Set<string> | null {
    return parseChildGrainLanesEnv();
}

/**
 * Whether Phase A child/candidate builders are enabled for a queue key.
 * Default: false (legacy runtime).
 */
export function isChildGrainLaneBuildersEnabled(queueKey: string): boolean {
    const key = queueKey.trim();
    if (!key) return false;
    const enabled = parseChildGrainLanesEnv();
    if (!enabled) return false;
    return enabled.has(key);
}

export function isChildGrainLaneBuilderQueueKey(queueKey: string): boolean {
    return CHILD_GRAIN_LANE_KEY_SET.has(queueKey.trim());
}

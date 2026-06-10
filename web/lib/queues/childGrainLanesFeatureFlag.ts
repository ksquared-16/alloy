import { businessProcessTracksConfigured } from "@/lib/businessProcesses/businessProcessConfigReader";

/**
 * Legacy child/candidate queue lane builders (pre-tracks_v1 tenants).
 *
 * When `tracks_v1` is configured, builder routing handles child-track context automatically.
 * This flag path remains for documented legacy fallback only.
 *
 * Pre-tracks opt-in: `ALLOY_QUEUE_CHILD_GRAIN_LANES=tours,waitlist` (or `all`).
 * Emergency disable when tracks auto-enable: `ALLOY_QUEUE_CHILD_GRAIN_LANES=0`.
 */

/** Queue keys that Phase A OCM builders may serve in legacy mode. */
export const CHILD_GRAIN_LANE_BUILDER_QUEUE_KEYS = [
    "tours",
    "tours_follow_up",
    "enrollment_offers",
    "enrollment_completed",
    "waitlist",
] as const;

export type ChildGrainLaneBuilderQueueKey = (typeof CHILD_GRAIN_LANE_BUILDER_QUEUE_KEYS)[number];

const CHILD_GRAIN_LANE_KEY_SET = new Set<string>(CHILD_GRAIN_LANE_BUILDER_QUEUE_KEYS);

const CHILD_GRAIN_LANES_ENV = "ALLOY_QUEUE_CHILD_GRAIN_LANES";

function parseChildGrainLanesEnv(): Set<string> | null {
    const raw = process.env[CHILD_GRAIN_LANES_ENV];
    if (raw == null) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const lowered = trimmed.toLowerCase();
    if (lowered === "0" || lowered === "false") return null;

    if (lowered === "1" || lowered === "true" || lowered === "all") {
        return new Set(CHILD_GRAIN_LANE_BUILDER_QUEUE_KEYS);
    }

    const keys = trimmed
        .split(/[,;\s]+/)
        .map((k) => k.trim())
        .filter(Boolean);
    return new Set(keys);
}

function isChildGrainLanesKillSwitch(): boolean {
    const raw = process.env[CHILD_GRAIN_LANES_ENV];
    if (raw == null) return false;
    const trimmed = raw.trim().toLowerCase();
    return trimmed === "0" || trimmed === "false";
}

/** Env snapshot for tests — call before/after with explicit value. */
export function readChildGrainLanesEnabledKeysFromEnv(): Set<string> | null {
    return parseChildGrainLanesEnv();
}

/**
 * Whether legacy Phase A child/candidate builders are enabled for a queue key.
 * Auto-enabled for standard lanes when tracks_v1 is configured (unless kill switch).
 */
export function isChildGrainLaneBuildersEnabled(
    queueKey: string,
    departmentMetadata?: unknown,
): boolean {
    const key = queueKey.trim();
    if (!key) return false;

    if (departmentMetadata !== undefined && businessProcessTracksConfigured(departmentMetadata)) {
        if (isChildGrainLanesKillSwitch()) return false;
        return CHILD_GRAIN_LANE_KEY_SET.has(key);
    }

    const enabled = parseChildGrainLanesEnv();
    return enabled?.has(key) ?? false;
}

export function isChildGrainLaneBuilderQueueKey(queueKey: string): boolean {
    return CHILD_GRAIN_LANE_KEY_SET.has(queueKey.trim());
}

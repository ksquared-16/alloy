/**
 * Phase C/D — read queue_membership_v1 in QueueService when enabled.
 *
 * `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=1` — builder metadata may drive lane routing
 * when valid config exists and lane is allowlisted.
 *
 * `ALLOY_QUEUE_MEMBERSHIP_BUILDER_LANES` — optional stage-key allowlist
 * (e.g. `enrolled,enrollment,tour,waitlist`). When unset, defaults to child/candidate
 * enrollment stages only — not Lead/Qualification case lanes.
 */

import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

/** Stages that may use builder-backed OCM/candidate routing (not case-grain). */
export const DEFAULT_BUILDER_MEMBERSHIP_STAGE_KEYS = [
    "tour",
    "enrollment",
    "enrolled",
    "waitlist",
] as const;

export type BuilderMembershipStageKey = (typeof DEFAULT_BUILDER_MEMBERSHIP_STAGE_KEYS)[number];

const STAGE_KEY_ALIASES: Record<string, string> = {
    enrolling: "enrollment",
};

function parseBuilderLanesEnv(): Set<string> | null {
    const raw = process.env.ALLOY_QUEUE_MEMBERSHIP_BUILDER_LANES;
    if (raw == null) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const keys = trimmed
        .split(/[,;\s]+/)
        .map((k) => STAGE_KEY_ALIASES[k.trim().toLowerCase()] ?? k.trim().toLowerCase())
        .filter(Boolean);
    return new Set(keys);
}

export function isQueueMembershipFromBuilderEnabled(): boolean {
    const raw = process.env.ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER;
    if (raw == null) return false;
    const trimmed = raw.trim().toLowerCase();
    return trimmed === "1" || trimmed === "true";
}

/** Env snapshot for tests. */
export function readQueueMembershipFromBuilderFlagFromEnv(): boolean {
    return isQueueMembershipFromBuilderEnabled();
}

export function normalizeBuilderMembershipStageKey(stageKey: string): string {
    const key = stageKey.trim().toLowerCase();
    return STAGE_KEY_ALIASES[key] ?? key;
}

/** Whether this membership stage may use builder routing (excludes case-grain Lead/Qualification). */
export function isBuilderMembershipStageAllowed(stageKey: string): boolean {
    const normalized = normalizeBuilderMembershipStageKey(stageKey);
    const allowlist = parseBuilderLanesEnv();
    if (allowlist) return allowlist.has(normalized);
    return (DEFAULT_BUILDER_MEMBERSHIP_STAGE_KEYS as readonly string[]).includes(normalized);
}

export function isBuilderMembershipLaneAllowed(membership: QueueMembershipV1): boolean {
    if (membership.subject_type === "case") return false;
    return isBuilderMembershipStageAllowed(membership.stage_key);
}

export function readBuilderMembershipLaneAllowlistFromEnv(): Set<string> | null {
    return parseBuilderLanesEnv();
}

/**
 * Business Process queue routing — metadata-first, env kill-switch only.
 *
 * Default ON when department metadata has active `tracks_v1`.
 * Emergency disable: `ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER=0` (or `false`).
 */

import { businessProcessTracksConfigured } from "@/lib/businessProcesses/businessProcessConfigReader";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

const BUILDER_RUNTIME_KILL_SWITCH_ENV = "ALLOY_QUEUE_MEMBERSHIP_FROM_BUILDER";

function readBuilderRuntimeKillSwitch(): boolean {
    const raw = process.env[BUILDER_RUNTIME_KILL_SWITCH_ENV];
    if (raw == null) return false;
    const trimmed = raw.trim().toLowerCase();
    return trimmed === "0" || trimmed === "false";
}

/** True when builder-backed queue membership routing is active for this department. */
export function isQueueMembershipFromBuilderEnabled(departmentMetadata?: unknown): boolean {
    if (readBuilderRuntimeKillSwitch()) return false;
    if (departmentMetadata !== undefined && businessProcessTracksConfigured(departmentMetadata)) {
        return true;
    }
    return false;
}

/** Env snapshot for tests. */
export function readQueueMembershipFromBuilderFlagFromEnv(): boolean {
    return !readBuilderRuntimeKillSwitch();
}

/** Whether parsed queue_membership_v1 is complete enough to drive routing. */
export function isBuilderMembershipLaneAllowed(membership: QueueMembershipV1): boolean {
    return Boolean(
        membership.version === 1 &&
            membership.stage_key?.trim() &&
            membership.subject_type?.trim() &&
            membership.lifecycle_key?.trim(),
    );
}

/** @deprecated Stage allowlists removed — any valid membership stage may route. */
export function isBuilderMembershipStageAllowed(stageKey: string): boolean {
    return Boolean(stageKey.trim());
}

/** @deprecated Builder lane allowlist env removed. */
export function readBuilderMembershipLaneAllowlistFromEnv(): Set<string> | null {
    return null;
}

/** @deprecated Alias retained for callers — no stage normalization gate. */
export function normalizeBuilderMembershipStageKey(stageKey: string): string {
    return stageKey.trim().toLowerCase();
}

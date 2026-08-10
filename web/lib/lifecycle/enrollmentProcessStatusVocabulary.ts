/**
 * Canonical Enrollment Business Process status vocabulary.
 * Family track → opportunities. Child track → opportunity_customer_members.
 */

import {
    ENROLLMENT_TRACK_CHILD_KEY,
    ENROLLMENT_TRACK_FAMILY_KEY,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

export type EnrollmentStatusVocabularyEntity = "opportunities" | "opportunity_customer_members";

export type EnrollmentStatusVocabularyRow = {
    status_key: string;
    status_label: string;
    sort_order: number;
    /**
     * @deprecated Stage is no longer derived from status — it is the persisted
     * `stage_key` column (S4 status collapse). Retained as an empty string only
     * to preserve the type shape for existing consumers; do NOT read it as a
     * status→stage mapping.
     */
    stage_key: string;
    entity_type: EnrollmentStatusVocabularyEntity;
    track_key: typeof ENROLLMENT_TRACK_FAMILY_KEY | typeof ENROLLMENT_TRACK_CHILD_KEY;
    active?: boolean;
    terminal?: boolean;
};

export const ENROLLMENT_GENERIC_OPPORTUNITY_CASE_KEYS = new Set([
    "open",
    "closed",
    "inactive",
    "archived",
]);

/**
 * Collapsed family case durable statuses on opportunities (S4).
 * Durable truth only: open | closed. Operational progress lives on Stage + Work.
 */
export const ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY: EnrollmentStatusVocabularyRow[] = [
    { status_key: "open", status_label: "Open", sort_order: 10, stage_key: "", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY },
    { status_key: "closed", status_label: "Closed", sort_order: 20, stage_key: "", entity_type: "opportunities", track_key: ENROLLMENT_TRACK_FAMILY_KEY, terminal: true },
];

/**
 * Collapsed child enrollment disposition statuses on OCM (S4).
 * null (in-process) | waitlisted | enrolling | enrolled | withdrawn | not_enrolling.
 */
export const ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY: EnrollmentStatusVocabularyRow[] = [
    { status_key: "waitlisted", status_label: "Waitlisted", sort_order: 10, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "enrolling", status_label: "Enrolling", sort_order: 20, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "enrolled", status_label: "Enrolled", sort_order: 30, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY },
    { status_key: "withdrawn", status_label: "Withdrawn", sort_order: 40, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY, terminal: true },
    { status_key: "not_enrolling", status_label: "Not Enrolling", sort_order: 50, stage_key: "", entity_type: "opportunity_customer_members", track_key: ENROLLMENT_TRACK_CHILD_KEY, terminal: true },
];

/**
 * @deprecated Status no longer maps to a single stage (S4). Stage is the persisted
 * `stage_key` column. This returns the full vocabulary for the entity (stage filter
 * is meaningless now) and exists only for back-compat of callers that expected a list.
 */
export function enrollmentStatusVocabularyForStage(
    _stageKey: string,
    entityType: EnrollmentStatusVocabularyEntity
): EnrollmentStatusVocabularyRow[] {
    return entityType === "opportunities"
        ? [...ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY]
        : [...ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY];
}

/**
 * COMPATIBILITY MAP — example stage keys to the durable states a record in them would carry.
 *
 * NOT a list of stages an Enrollment process must have, and not an authority over configured
 * grain. Which stages exist, and what grain each carries, is configuration's decision; this map
 * is consulted only where configuration is SILENT — chiefly stages authored before `grain` was an
 * explicit field, and the Stage Context "membership" display.
 *
 * `resolveStageGrain` ranks this BELOW both configured declarations for exactly that reason. It
 * previously outranked configured metadata, which let a platform-owned list of names overrule a
 * tenant's own process. Do not reintroduce that precedence, and do not add a runtime invariant
 * that requires any key here to exist.
 */
export const ENROLLMENT_STAGE_DURABLE_STATES: Record<
    string,
    { entity: EnrollmentStatusVocabularyEntity; grain: "family" | "child"; status_keys: string[] }
> = {
    // Family / lead grain — case durable status is open until closed; position is the stage.
    lead: { entity: "opportunities", grain: "family", status_keys: ["open"] },
    tour: { entity: "opportunities", grain: "family", status_keys: ["open"] },
    decision: { entity: "opportunities", grain: "family", status_keys: ["open"] },
    closed: { entity: "opportunities", grain: "family", status_keys: ["closed"] },
    // Child / enrollment grain — per-child durable enrollment state.
    waitlist: { entity: "opportunity_customer_members", grain: "child", status_keys: ["waitlisted"] },
    enrolling: { entity: "opportunity_customer_members", grain: "child", status_keys: ["enrolling"] },
    enrolled: { entity: "opportunity_customer_members", grain: "child", status_keys: ["enrolled"] },
    closed_withdrawn: {
        entity: "opportunity_customer_members",
        grain: "child",
        status_keys: ["withdrawn", "not_enrolling"],
    },
};

/** Stage membership for display: durable state key+label pairs that belong in a stage, or null if unknown. */
export function enrollmentStageMembership(
    stageKey: string
): { grain: "family" | "child"; states: { key: string; label: string }[] } | null {
    const entry = ENROLLMENT_STAGE_DURABLE_STATES[stageKey.trim()];
    if (!entry) return null;
    const vocab =
        entry.entity === "opportunities"
            ? ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY
            : ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY;
    const states = entry.status_keys.map((key) => {
        const row = vocab.find((r) => r.status_key === key);
        return { key, label: row?.status_label ?? key };
    });
    return { grain: entry.grain, states };
}

/** Platform-managed durable status keys for a known enrollment stage, or null when manual selection is required. */
export function resolvePlatformManagedStatusKeysForStage(stageKey: string): string[] | null {
    const membership = enrollmentStageMembership(stageKey);
    if (!membership?.states.length) return null;
    return membership.states.map((row) => row.key);
}

/** True when operators must explicitly assign status keys — unknown/custom stages without platform-managed durable states. */
export function stageRequiresManualStatusSelection(stageKey: string): boolean {
    return resolvePlatformManagedStatusKeysForStage(stageKey) === null;
}

/** Effective status keys for save/runtime — explicit selection wins; else platform-managed durable states. */
export function effectiveLifecycleStageStatusKeys(
    stageKey: string,
    selectedKeys: readonly string[],
): string[] {
    const manual = selectedKeys.map((key) => key.trim()).filter(Boolean);
    if (manual.length > 0) return [...new Set(manual)];
    return resolvePlatformManagedStatusKeysForStage(stageKey) ?? [];
}

export function enrollmentStatusVocabularyMetadata(
    row: EnrollmentStatusVocabularyRow
): Record<string, unknown> {
    const layer =
        row.entity_type === "opportunities" ? "enrollment_process" : "enrollment_disposition";
    return {
        alloy_layer: layer,
        status_settings_category: "enrollment_statuses",
        process_key: ENROLLMENT_PROCESS_KEY,
        track_key: row.track_key,
        entity_scope: row.entity_type === "opportunities" ? "family_case" : "enrollment_track",
        active: row.active !== false,
        ...(row.terminal ? { terminal: true } : {}),
        seed_source: "enrollment_alignment_status_collapse_v1",
    };
}

export function isGenericEnrollmentCaseContainerStatus(
    statusKey: string,
    metadata: Record<string, unknown> | null | undefined
): boolean {
    if (!ENROLLMENT_GENERIC_OPPORTUNITY_CASE_KEYS.has(statusKey.trim())) return false;
    if (!metadata || typeof metadata !== "object") return true;
    const layer = metadata.alloy_layer;
    return layer == null || layer === "case_status";
}

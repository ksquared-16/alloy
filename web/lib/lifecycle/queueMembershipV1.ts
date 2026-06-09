/**
 * queue_membership_v1 — lifecycle builder stage queue membership contract (Phase A).
 *
 * Types + parser + enrollment defaults only. No runtime queue routing or save-path wiring.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

export type QueueMembershipSubjectType = "case" | "child" | "candidate";

export type QueueMembershipCountUnit =
    | "cases"
    | "enrollment_tracks"
    | "children"
    | "candidates";

export type QueueMembershipLocationScopeSource =
    | "ocm_site"
    | "placement_site"
    | "case_site";

export type QueueMembershipPlacementScope =
    | "active_only"
    | "active_and_paused";

export type QueueMembershipV1 = {
    version: 1;
    lifecycle_key: string;
    stage_key: string;
    subject_type: QueueMembershipSubjectType;
    count_unit: QueueMembershipCountUnit;
    included_disposition_keys: string[];
    included_status_keys?: string[];
    location_scope_source?: QueueMembershipLocationScopeSource | null;
    placement_scope?: QueueMembershipPlacementScope | null;
    queue_builder_key?: string | null;
};

const SUBJECT_TYPES = new Set<QueueMembershipSubjectType>(["case", "child", "candidate"]);

const COUNT_UNITS = new Set<QueueMembershipCountUnit>([
    "cases",
    "enrollment_tracks",
    "children",
    "candidates",
]);

const LOCATION_SCOPE_SOURCES = new Set<QueueMembershipLocationScopeSource>([
    "ocm_site",
    "placement_site",
    "case_site",
]);

const PLACEMENT_SCOPES = new Set<QueueMembershipPlacementScope>([
    "active_only",
    "active_and_paused",
]);

const ENROLLMENT_DEFAULT_STAGE_KEYS = new Set([
    "lead",
    "qualification",
    "tour",
    "waitlist",
    "enrollment",
    "enrolled",
]);

function trimNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const out: string[] = [];
    for (const item of value) {
        if (typeof item !== "string") continue;
        const trimmed = item.trim();
        if (trimmed.length > 0) out.push(trimmed);
    }
    return out;
}

function parseOptionalNullableEnum<T extends string>(
    value: unknown,
    allowed: Set<T>,
): T | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = trimNonEmptyString(value);
    if (!trimmed || !allowed.has(trimmed as T)) return undefined;
    return trimmed as T;
}

function parseOptionalNullableString(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = trimNonEmptyString(value);
    return trimmed ?? undefined;
}

/** Safely parse raw metadata into a normalized queue_membership_v1 object. */
export function parseQueueMembershipV1(raw: unknown): QueueMembershipV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;

    if (record.version !== 1) return null;

    const lifecycle_key = trimNonEmptyString(record.lifecycle_key);
    const stage_key = trimNonEmptyString(record.stage_key);
    const subject_typeRaw = trimNonEmptyString(record.subject_type);
    const count_unitRaw = trimNonEmptyString(record.count_unit);

    if (!lifecycle_key || !stage_key || !subject_typeRaw || !count_unitRaw) return null;
    if (!SUBJECT_TYPES.has(subject_typeRaw as QueueMembershipSubjectType)) return null;
    if (!COUNT_UNITS.has(count_unitRaw as QueueMembershipCountUnit)) return null;

    const included_disposition_keys = parseStringArray(record.included_disposition_keys);
    if (included_disposition_keys === null) return null;

    let included_status_keys: string[] | undefined;
    if (record.included_status_keys !== undefined) {
        const parsed = parseStringArray(record.included_status_keys);
        if (parsed === null) return null;
        included_status_keys = parsed;
    }

    const location_scope_source = parseOptionalNullableEnum(
        record.location_scope_source,
        LOCATION_SCOPE_SOURCES,
    );
    if (record.location_scope_source !== undefined && location_scope_source === undefined) {
        return null;
    }

    const placement_scope = parseOptionalNullableEnum(record.placement_scope, PLACEMENT_SCOPES);
    if (record.placement_scope !== undefined && placement_scope === undefined) {
        return null;
    }

    const queue_builder_key = parseOptionalNullableString(record.queue_builder_key);
    if (record.queue_builder_key !== undefined && queue_builder_key === undefined) {
        return null;
    }

    const membership: QueueMembershipV1 = {
        version: 1,
        lifecycle_key,
        stage_key,
        subject_type: subject_typeRaw as QueueMembershipSubjectType,
        count_unit: count_unitRaw as QueueMembershipCountUnit,
        included_disposition_keys,
    };

    if (included_status_keys !== undefined) {
        membership.included_status_keys = included_status_keys;
    }
    if (location_scope_source !== undefined) {
        membership.location_scope_source = location_scope_source;
    }
    if (placement_scope !== undefined) {
        membership.placement_scope = placement_scope;
    }
    if (queue_builder_key !== undefined) {
        membership.queue_builder_key = queue_builder_key;
    }

    return membership;
}

type EnrollmentDefaultSpec = Pick<
    QueueMembershipV1,
    | "subject_type"
    | "count_unit"
    | "included_disposition_keys"
    | "included_status_keys"
    | "location_scope_source"
>;

const ENROLLMENT_STAGE_DEFAULTS: Record<string, EnrollmentDefaultSpec> = {
    lead: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: [],
        included_status_keys: ["new_inquiry"],
    },
    qualification: {
        subject_type: "case",
        count_unit: "cases",
        included_disposition_keys: ["needs_qualification", "qualified"],
    },
    tour: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: [
            "tour_requested",
            "tour_scheduled",
            "tour_completed",
            "decision_pending",
        ],
    },
    waitlist: {
        subject_type: "candidate",
        count_unit: "candidates",
        location_scope_source: "placement_site",
        included_disposition_keys: ["waitlisted", "waitlist_paused"],
    },
    enrollment: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: [
            "offer_pending",
            "registration_pending",
            "paperwork_pending",
            "start_date_scheduled",
        ],
    },
    enrolled: {
        subject_type: "child",
        count_unit: "enrollment_tracks",
        location_scope_source: "ocm_site",
        included_disposition_keys: ["enrolled"],
    },
};

/** Locked default queue_membership_v1 for canonical enrollment builder stages. */
export function defaultQueueMembershipForEnrollmentStage(stageKey: string): QueueMembershipV1 | null {
    const normalized = stageKey.trim();
    if (!normalized || !ENROLLMENT_DEFAULT_STAGE_KEYS.has(normalized)) return null;

    const spec = ENROLLMENT_STAGE_DEFAULTS[normalized];
    if (!spec) return null;

    return {
        version: 1,
        lifecycle_key: ENROLLMENT_PROCESS_KEY,
        stage_key: normalized,
        subject_type: spec.subject_type,
        count_unit: spec.count_unit,
        included_disposition_keys: [...spec.included_disposition_keys],
        ...(spec.location_scope_source ? { location_scope_source: spec.location_scope_source } : {}),
        ...(spec.included_status_keys?.length ?
            { included_status_keys: [...spec.included_status_keys] }
        :   {}),
    };
}

/**
 * Resolve queue membership for a builder stage record.
 * Prefers explicit valid queue_membership_v1; falls back to enrollment defaults.
 */
export function resolveQueueMembershipForStage(
    stageConfig: unknown,
    fallbackStageKey: string,
): QueueMembershipV1 | null {
    if (stageConfig != null && typeof stageConfig === "object" && !Array.isArray(stageConfig)) {
        const record = stageConfig as Record<string, unknown>;
        if (record.queue_membership_v1 !== undefined) {
            const parsed = parseQueueMembershipV1(record.queue_membership_v1);
            if (parsed) return parsed;
        }
    }

    return defaultQueueMembershipForEnrollmentStage(fallbackStageKey);
}

import { buildPersonEnrollmentActivityEntries } from "@/lib/admin/person/buildPersonEnrollmentActivityEntries";
import { personDrawerCrmDisplayLabel } from "@/lib/admin/person/personDrawerChildIdentity";
import {
    PERSON_DRAWER_CHILD_PLACEMENT_SOURCE,
    formatChildEnrollmentContextLine,
} from "@/lib/admin/person/personDrawerLocationCategoryOwnership";
import type {
    PersonEnrollmentMirrorRow,
    PersonEnrollmentOpportunityRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

export { PERSON_DRAWER_CHILD_PLACEMENT_SOURCE };

export const PERSON_DRAWER_EDIT_PLACEMENT_ON_LEAD_LABEL = "Edit on Family Lead" as const;

export type PersonDrawerChildPlacementContext = {
    source: typeof PERSON_DRAWER_CHILD_PLACEMENT_SOURCE;
    program_label: string | null;
    location_label: string | null;
    room_label: string | null;
    status_label: string | null;
    primary_opportunity_id: string | null;
    /** OCM row id — PATCH owner for placement edits on Family Lead. */
    primary_ocm_id: string | null;
};

function primaryMirrorRowForEntry(
    mirror: PersonEnrollmentMirrorRow[],
    opportunityId: string | null
): PersonEnrollmentMirrorRow | null {
    if (!mirror.length) return null;
    const rows = opportunityId
        ? mirror.filter((row) => row.opportunity_id === opportunityId)
        : mirror;
    const pool = rows.length > 0 ? rows : mirror;
    return (
        pool.find((row) => trimOrNull(row.program_label) || trimOrNull(row.location_label)) ??
        pool[0] ??
        null
    );
}

/**
 * Child school/site + program/category from `_enrollment_mirror` (OCM projection) only.
 * Never reads `persons` placement columns or person field_values.
 */
export function resolvePersonDrawerChildPlacementFromRecord(
    record: Record<string, unknown>
): PersonDrawerChildPlacementContext {
    const mirror = (record._enrollment_mirror as PersonEnrollmentMirrorRow[]) ?? [];
    const opps = (record._enrollment_opportunities as PersonEnrollmentOpportunityRow[]) ?? [];
    const entry = buildPersonEnrollmentActivityEntries(mirror, opps)[0] ?? null;
    const mirrorRow = primaryMirrorRowForEntry(mirror, entry?.opportunity_id ?? null);

    const program_label = trimOrNull(mirrorRow?.program_label) || trimOrNull(entry?.program_label);
    const location_label = trimOrNull(mirrorRow?.location_label) || trimOrNull(entry?.location_label);
    const room_label = trimOrNull(mirrorRow?.room_label) || trimOrNull(entry?.room_label);

    const statusRaw =
        entry?.status_label?.trim() || entry?.outcome_label?.trim() || null;

    return {
        source: PERSON_DRAWER_CHILD_PLACEMENT_SOURCE,
        program_label,
        location_label,
        room_label,
        status_label: statusRaw ? personDrawerCrmDisplayLabel(statusRaw) : null,
        primary_opportunity_id: trimOrNull(entry?.opportunity_id),
        primary_ocm_id: trimOrNull(mirrorRow?.id),
    };
}

export function formatPersonDrawerChildPlacementLine(
    placement: Pick<PersonDrawerChildPlacementContext, "program_label" | "location_label">
): string | null {
    return formatChildEnrollmentContextLine({
        program_label: placement.program_label,
        location_label: placement.location_label,
    });
}

/** True when child drawer has a Family Lead to open for placement edits (OCM owner). */
export function personDrawerChildCanEditPlacementOnLead(
    placement: PersonDrawerChildPlacementContext
): boolean {
    return Boolean(placement.primary_opportunity_id?.trim());
}

/** Blocked person-root keys for child placement — must not become drawer SoT. */
export function personRecordHasPersonLevelPlacementFields(record: Record<string, unknown>): boolean {
    const blockedKeys = [
        "school_location",
        "location_id",
        "assigned_location_id",
        "program_label",
        "category_label",
        "program_category_id",
        "classroom_label",
    ];
    return blockedKeys.some((key) => trimOrNull(record[key]) != null);
}

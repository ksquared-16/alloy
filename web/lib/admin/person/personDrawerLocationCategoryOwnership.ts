import type { PersonDrawerHouseholdChildMember } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

/** Active enrollment / OCM projection — not `persons` columns. */
export const PERSON_DRAWER_CHILD_PLACEMENT_SOURCE = "enrollment_mirror" as const;

export type ChildEnrollmentPlacementContext = {
    program_label: string | null;
    location_label: string | null;
    room_label?: string | null;
};

export type ChildHouseholdCardLines = {
    age_line: string | null;
    placement_line: string | null;
    classroom_line: string | null;
};

export function childEnrollmentPlacementFromRow(row: {
    program_label?: string | null;
    location_label?: string | null;
    room_label?: string | null;
}): ChildEnrollmentPlacementContext {
    return {
        program_label: trimOrNull(row.program_label),
        location_label: trimOrNull(row.location_label),
        room_label: trimOrNull(row.room_label),
    };
}

/** Household child card: age · program · site on one line; optional classroom below. */
export function resolveChildHouseholdCardLines(row: {
    age_label?: string | null;
    program_label?: string | null;
    location_label?: string | null;
    room_label?: string | null;
}): ChildHouseholdCardLines {
    const placement = childEnrollmentPlacementFromRow(row);
    const contextParts = [
        trimOrNull(row.age_label),
        placement.program_label,
        placement.location_label,
    ].filter(Boolean);
    const placement_line = contextParts.length > 0 ? contextParts.join(" · ") : null;
    const classroom = placement.room_label;
    const program = placement.program_label;
    const classroom_line =
        classroom && classroom !== program ? classroom : null;
    return {
        age_line: null,
        placement_line,
        classroom_line,
    };
}

/** Compact per-child line for parent household child rows (program + location from enrollment mirror). */
export function formatChildEnrollmentContextLine(
    context: ChildEnrollmentPlacementContext
): string | null {
    const parts = [context.program_label, context.location_label].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
}

export function childRowHasEnrollmentPlacement(context: ChildEnrollmentPlacementContext): boolean {
    return Boolean(context.program_label || context.location_label);
}

/**
 * Household-level placement note only when every visible child shares the same program and location.
 * Parents remain location-agnostic — never infer one location for the adult.
 */
export function resolveSharedHouseholdPlacementContext(
    children: PersonDrawerHouseholdChildMember[]
): (ChildEnrollmentPlacementContext & { shared: true }) | null {
    if (children.length < 2) return null;

    const placements = children.map((child) => childEnrollmentPlacementFromRow(child));
    if (!placements.every(childRowHasEnrollmentPlacement)) return null;

    const first = placements[0]!;
    const allMatch = placements.every(
        (p) => p.program_label === first.program_label && p.location_label === first.location_label
    );
    if (!allMatch) return null;

    return { ...first, shared: true };
}

/** Parent drawer must not surface person-level placement fields. */
export function personRecordHasParentLevelPlacementFields(record: Record<string, unknown>): boolean {
    const blockedKeys = [
        "school_location",
        "location_id",
        "assigned_location_id",
        "program_label",
        "category_label",
        "desired_program_type",
    ];
    return blockedKeys.some((key) => trimOrNull(record[key]) != null);
}

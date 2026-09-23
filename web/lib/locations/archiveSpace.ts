/**
 * Whether a Space may leave current configuration.
 *
 * Archive is durable retirement: the row stays, its id stays resolvable, and
 * every historical attendance record, placement and schedule keeps its label.
 * What changes is that the Space stops being an answer to "what does this site
 * have" and stops being offered anywhere a current choice is made.
 *
 * THE QUESTION IS ABOUT THE FUTURE, NOT THE PAST. "Has this space ever been
 * used" would refuse almost every real room and protect nothing — the history
 * is exactly what archive preserves. What must refuse is an archive that would
 * invalidate current or future operation: a child still placed there next
 * month, a staff assignment that has not ended, a physical space still holding
 * groups that would be left pointing at a container nobody can see.
 *
 * Pure functions only. The caller supplies what it measured; this decides.
 */

/** Live dependencies, as the server counted them. */
export type SpaceArchiveDependencies = {
    /** Non-archived units whose parent is this space. */
    activeChildSpaces: number;
    /** Child placements at this room that have not ended. */
    currentOrFuturePlacements: number;
    /** Schedule assignments at this room that have not ended. */
    currentOrFutureAssignments: number;
    /** Staff coverage allocations at this room that are still effective. */
    currentOrFutureCoverage: number;
};

export type SpaceArchiveRefusal =
    | "space_not_found"
    | "already_archived"
    | "space_contains_active_spaces"
    | "space_has_current_placements"
    | "space_has_current_assignments"
    | "space_has_current_coverage";

export const SPACE_ARCHIVE_REFUSAL_COPY: Record<SpaceArchiveRefusal, string> = {
    space_not_found: "That space no longer exists.",
    already_archived: "That space is already archived.",
    space_contains_active_spaces:
        "This physical space still holds other spaces. Move them somewhere else, clear their physical space, or archive them first.",
    space_has_current_placements:
        "Children are still placed here now or in the future. Move them before archiving this space.",
    space_has_current_assignments:
        "Staff or children are still scheduled here now or in the future. Move those assignments before archiving this space.",
    space_has_current_coverage:
        "Staff coverage is still planned here. Cancel or move it before archiving this space.",
};

export type SpaceArchiveDecision =
    | { ok: true }
    | { ok: false; code: SpaceArchiveRefusal; message: string };

const refuse = (code: SpaceArchiveRefusal): SpaceArchiveDecision => ({
    ok: false,
    code,
    message: SPACE_ARCHIVE_REFUSAL_COPY[code],
});

/**
 * Decide whether this space may be archived.
 *
 * Order matters only for which reason an operator is shown first, and the
 * containment refusal leads deliberately: it is the one they can act on without
 * leaving the Spaces screen.
 */
export function decideSpaceArchive(input: {
    exists: boolean;
    alreadyArchived: boolean;
    dependencies: SpaceArchiveDependencies;
}): SpaceArchiveDecision {
    if (!input.exists) return refuse("space_not_found");
    if (input.alreadyArchived) return refuse("already_archived");

    const d = input.dependencies;
    // NO ORPHANING. A group left pointing at an archived container would show a
    // physical space the operator can no longer open.
    if (d.activeChildSpaces > 0) return refuse("space_contains_active_spaces");
    if (d.currentOrFuturePlacements > 0) return refuse("space_has_current_placements");
    if (d.currentOrFutureAssignments > 0) return refuse("space_has_current_assignments");
    if (d.currentOrFutureCoverage > 0) return refuse("space_has_current_coverage");
    return { ok: true };
}

/** Is this row part of current configuration? */
export function isArchivedSpace(row: { archived_at?: string | null } | null | undefined): boolean {
    return row?.archived_at != null;
}

/**
 * The spaces that belong in ordinary configuration.
 *
 * Inactive spaces STAY: "closed for the summer" is still part of how this site
 * is configured, and hiding it would lose the operator's own decision. Only
 * archived spaces leave.
 */
export function currentConfigurationSpaces<T extends { archived_at?: string | null }>(
    rows: readonly T[]
): T[] {
    return rows.filter((row) => !isArchivedSpace(row));
}

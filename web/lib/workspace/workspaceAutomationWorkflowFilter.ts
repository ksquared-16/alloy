/**
 * Client-side filter for workspace automation panels.
 * Workflows table has no department_id / work_unit_id — org-wide list + entity-type heuristic only.
 */

export type WorkspaceAutomationWorkflowRow = {
    id: string;
    name: string | null;
    event_type: string | null;
    entity_type: string | null;
    enabled: boolean | null;
    steps_count: number;
    last_run?: { id: string; status: string; started_at: string; has_failed_action?: boolean } | null;
};

const ENROLLMENT_ENTITY_TYPES = new Set(["opportunity", "opportunities", "tour_bookings"]);

/** Shown on department/work-unit automation panels until workflows carry dept/WU metadata. */
export const WORKSPACE_AUTOMATION_METADATA_GAP_NOTE =
    "Workflows are not linked to departments or work units in the database yet. Showing org-wide enrollment-adjacent automations.";

/**
 * Prefer enrollment-adjacent entity types on department/work-unit surfaces.
 * Full dept/WU linkage requires future workflow metadata (see sprint doc).
 */
export function filterWorkflowsForWorkspaceAutomationSurface(
    rows: WorkspaceAutomationWorkflowRow[],
    opts: { enrollmentAdjacent?: boolean } = {}
): WorkspaceAutomationWorkflowRow[] {
    const { enrollmentAdjacent = true } = opts;
    if (!enrollmentAdjacent) return rows;
    const filtered = rows.filter((w) => {
        const et = (w.entity_type ?? "").trim().toLowerCase();
        return !et || ENROLLMENT_ENTITY_TYPES.has(et);
    });
    return filtered.length > 0 ? filtered : rows.slice(0, 8);
}

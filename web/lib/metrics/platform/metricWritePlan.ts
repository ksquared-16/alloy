/**
 * Pure helpers that prevent duplicate metric-platform records.
 *
 * Invariant: once an org-owned object exists for the current editing session
 * (created or copied-on-edit), every subsequent save must PATCH that id — never POST.
 * This is what stops "Save draft" then "Publish" (or a double click) from creating duplicates.
 */

export type WriteMethod = "POST" | "PATCH";

export type WriteTarget = { method: WriteMethod; id: string | null };

/**
 * Decide whether the next write should create or update.
 *
 * @param workingId The org-owned id already established this session (from a prior
 *   successful create, a copy-on-edit, or selecting an existing org row). When set,
 *   we always update it so repeated saves/publishes never duplicate.
 */
export function resolveWriteTarget(workingId: string | null | undefined): WriteTarget {
    if (workingId) return { method: "PATCH", id: workingId };
    return { method: "POST", id: null };
}

export type PlacementLocation = {
    surface: string;
    placement_zone: string;
    surface_key: string;
};

export type ExistingPlacement = PlacementLocation & {
    id: string;
    status: string;
};

export type PlacementPlan = {
    creates: PlacementLocation[];
    updates: { id: string; status: string }[];
    removes: string[];
};

function placementKey(p: PlacementLocation): string {
    return `${p.surface}::${p.placement_zone}::${p.surface_key}`;
}

/**
 * Reconcile the set of selected placement locations against what already exists,
 * so re-running a save never inserts a second row for the same surface/zone.
 *
 * - A selected location with no existing row → create.
 * - A selected location that already exists → update its status (and revive if archived).
 * - An existing non-archived row no longer selected → archive (remove).
 */
export function planPlacementWrites(
    existing: ExistingPlacement[],
    selected: PlacementLocation[],
    desiredStatus: "draft" | "active",
): PlacementPlan {
    const existingByKey = new Map<string, ExistingPlacement>();
    for (const row of existing) existingByKey.set(placementKey(row), row);

    const selectedKeys = new Set(selected.map(placementKey));

    const creates: PlacementLocation[] = [];
    const updates: { id: string; status: string }[] = [];

    for (const loc of selected) {
        const match = existingByKey.get(placementKey(loc));
        if (!match) {
            creates.push(loc);
        } else if (match.status !== desiredStatus) {
            updates.push({ id: match.id, status: desiredStatus });
        }
    }

    const removes: string[] = [];
    for (const row of existing) {
        if (row.status === "archived") continue;
        if (!selectedKeys.has(placementKey(row))) removes.push(row.id);
    }

    return { creates, updates, removes };
}

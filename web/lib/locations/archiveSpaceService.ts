/**
 * Server-authoritative Space archive.
 *
 * Everything that decides is counted here, on the server, and handed to the
 * pure decision in `archiveSpace`. A UI check would be a suggestion; this is
 * the authority, and the route is the only way in.
 *
 * The counts deliberately ask about the FUTURE. A placement that ended last
 * March does not stop a room being retired — that history is the thing archive
 * exists to keep. An assignment with no end date, or one ending later than
 * today, does.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    decideSpaceArchive,
    type SpaceArchiveDecision,
    type SpaceArchiveDependencies,
} from "@/lib/locations/archiveSpace";

export type ArchiveSpaceResult =
    | { ok: true; id: string; archivedAt: string }
    | (SpaceArchiveDecision & { ok: false });

/** Rows that have not ended on or before `todayYmd`, i.e. still ahead of us. */
async function countUnended(
    supabase: SupabaseClient,
    table: string,
    orgId: string,
    roomLocationId: string,
    todayYmd: string,
    endColumn = "end_date",
    statusColumn: string | null = "status",
    terminalStatuses: readonly string[] = ["cancelled", "canceled", "ended", "withdrawn"],
): Promise<number> {
    let q = supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("room_location_id", roomLocationId)
        // An open-ended row is current by definition; a dated one only counts
        // while its end is still ahead of today.
        .or(`${endColumn}.is.null,${endColumn}.gte.${todayYmd}`);
    if (statusColumn) q = q.not(statusColumn, "in", `(${terminalStatuses.join(",")})`);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
}

export async function archiveSpace(
    supabase: SupabaseClient,
    input: { orgId: string; locationId: string; todayYmd: string; actorUserId?: string | null },
): Promise<ArchiveSpaceResult> {
    const { data: row, error } = await supabase
        .from("locations")
        .select("id, location_type, archived_at")
        .eq("org_id", input.orgId)
        .eq("id", input.locationId)
        .maybeSingle();
    if (error) throw new Error(error.message);

    const exists = row != null && row.location_type === "unit";
    const alreadyArchived = row?.archived_at != null;

    let dependencies: SpaceArchiveDependencies = {
        activeChildSpaces: 0,
        currentOrFuturePlacements: 0,
        currentOrFutureAssignments: 0,
        currentOrFutureCoverage: 0,
    };

    if (exists && !alreadyArchived) {
        const { count: childCount, error: childErr } = await supabase
            .from("locations")
            .select("id", { count: "exact", head: true })
            .eq("org_id", input.orgId)
            .eq("parent_location_id", input.locationId)
            .is("archived_at", null);
        if (childErr) throw new Error(childErr.message);

        const [placements, assignments, coverage] = await Promise.all([
            countUnended(supabase, "child_placements", input.orgId, input.locationId, input.todayYmd),
            countUnended(supabase, "schedule_assignments", input.orgId, input.locationId, input.todayYmd),
            // Coverage is a single service date, not a range.
            (async () => {
                const { count, error: covErr } = await supabase
                    .from("staff_coverage_allocations")
                    .select("id", { count: "exact", head: true })
                    .eq("org_id", input.orgId)
                    .eq("room_location_id", input.locationId)
                    .eq("lifecycle_state", "active")
                    .gte("service_date", input.todayYmd);
                if (covErr) throw new Error(covErr.message);
                return count ?? 0;
            })(),
        ]);

        dependencies = {
            activeChildSpaces: childCount ?? 0,
            currentOrFuturePlacements: placements,
            currentOrFutureAssignments: assignments,
            currentOrFutureCoverage: coverage,
        };
    }

    const decision = decideSpaceArchive({ exists, alreadyArchived, dependencies });
    if (!decision.ok) return decision;

    const archivedAt = new Date().toISOString();
    const { error: updateErr } = await supabase
        .from("locations")
        .update({ archived_at: archivedAt, updated_by: input.actorUserId ?? null })
        .eq("org_id", input.orgId)
        .eq("id", input.locationId);
    if (updateErr) throw new Error(updateErr.message);

    // NOTE: is_active is deliberately untouched. Archive is its own state, and
    // collapsing the two would lose whether this space was paused or retired.
    return { ok: true, id: input.locationId, archivedAt };
}

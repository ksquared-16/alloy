/**
 * The server half of `spaceEligibleForUse`: every assignment writer that names a room calls this.
 *
 * One read of the room (its structural role and configured uses) and the rule in
 * `lib/location/spaceUse.ts` — the same one the pickers and Rooms configuration apply.
 *
 * AN EDIT THAT KEEPS ITS ROOM AND USE IS NEVER REFUSED. A replacement whose predecessor already sat
 * in this room with this category is the same participation continuing (new days, new hours), so a
 * space configured after the fact cannot make an ordinary edit of an existing assignment fail.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { canonicalUnitRoleFromStorage } from "@/lib/location/canonicalLocationModel";
import { readSpaceUses, readSpaceUsesState, spaceEligibleForUse } from "@/lib/location/spaceUse";

export async function assertSpaceEligibleForAssignment(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        roomLocationId: string;
        categoryId: string | null;
        subjectType: "child" | "staff";
        /** The row being replaced, when this write supersedes one. */
        supersedesAssignmentId?: string | null;
    },
): Promise<void> {
    if (args.supersedesAssignmentId) {
        const { data: prior, error: priorError } = await supabase
            .from("schedule_assignments")
            .select("room_location_id, operational_assignment_type_id")
            .eq("org_id", args.orgId)
            .eq("id", args.supersedesAssignmentId)
            .maybeSingle();
        if (priorError) throw new OperationalEnrollmentServiceError("db_error", priorError.message);
        const p = prior as { room_location_id: string | null; operational_assignment_type_id: string | null } | null;
        if (p && p.room_location_id === args.roomLocationId && (p.operational_assignment_type_id ?? null) === (args.categoryId ?? null)) return;
    }

    const { data: unit, error } = await supabase
        .from("locations")
        .select("location_type, unit_role, metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.roomLocationId)
        .maybeSingle();
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    const row = unit as { location_type?: unknown; unit_role?: unknown; metadata?: Record<string, unknown> | null } | null;
    const unitRole = canonicalUnitRoleFromStorage(row?.location_type, row?.unit_role);
    // Not a unit: room-under-site validation (run before this) already refuses it with its own message.
    if (!unitRole) return;
    const verdict = spaceEligibleForUse(
        {
            unitRole,
            spaceUses: readSpaceUses(row?.metadata ?? null),
            spaceUsesMalformed: readSpaceUsesState(row?.metadata ?? null).kind === "malformed",
        },
        { categoryId: args.categoryId, subjectType: args.subjectType },
    );
    if (!verdict.ok) {
        throw new OperationalEnrollmentServiceError("validation_failed", verdict.message, {
            field: "room_location_id",
            code: verdict.code,
        });
    }
}

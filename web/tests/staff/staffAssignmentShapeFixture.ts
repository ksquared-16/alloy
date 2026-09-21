/**
 * The shape rule, stated once so the convergence test can assert it.
 *
 * Kept beside the test rather than shipped in `lib/`: the product does not need a
 * shape enum to work — `room_location_id` being nullable IS the rule — and adding
 * one would invent a vocabulary the authority does not have.
 */
export function resolveStaffAssignmentShapeFixture(row: {
    roomLocationId: string | null;
    schedulePatternId: string | null;
}): "classroom" | "site_only" | "unscheduled" {
    if (row.roomLocationId) return "classroom";
    return row.schedulePatternId ? "site_only" : "unscheduled";
}

/**
 * Pure membership transform for Tours Work View.
 * Active tour_bookings → opportunity id IN (Waitlist ∩ Tours overlap).
 */

export type TourLaneQueryOp =
    | { kind: "eq"; column: string; value?: unknown }
    | { kind: "in"; column: string; values?: string[] }
    | { kind: string; column?: string; value?: unknown; values?: string[] };

const EMPTY_SENTINEL = "00000000-0000-0000-0000-000000000000";

export function tourLaneOpsFromActiveBookingOpportunityIds(
    ops: readonly TourLaneQueryOp[],
    opportunityIds: readonly string[],
): TourLaneQueryOp[] {
    const ids = [
        ...new Set(opportunityIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
    ];
    const withoutStage = ops.filter((op) => !(op.kind === "eq" && op.column === "stage_key"));
    const values = ids.length > 0 ? ids : [EMPTY_SENTINEL];
    return [{ kind: "in", column: "id", values }, ...withoutStage];
}

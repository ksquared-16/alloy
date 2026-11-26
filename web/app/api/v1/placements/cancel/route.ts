/**
 * POST /api/v1/placements/cancel — a placement that should never have been effective.
 *
 * ── WHY `move` IS NOT THIS ──
 *
 * Supersession requires the replacement to start strictly after the row it replaces and closes that
 * row the day before, so the superseded placement always asserts a non-empty period during which it
 * was the truth. That is correct for "the child was in Room A and then moved to Room B". It is a
 * lie for "this was recorded against the wrong child and never happened", and a partner that had
 * already synchronised the row cannot tell those apart afterwards.
 *
 * So the two intents are separate on purpose. `move` says the past was real; `cancel` says it never
 * was. Cancelling is not a delete: the row is retained and turns `canceled`, so an id a partner
 * already holds still resolves and carries its own explanation.
 *
 * Safe to retry: cancelling an already-cancelled placement returns it unchanged rather than
 * refusing, so an attempt a caller could not confirm converges instead of becoming a conflict.
 */

import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import {
    requiredId,
    resolveServiceStateRowInAuthority,
    toPlacementResult,
} from "@/lib/platform/external/resources/serviceStateOperations";
import { cancelChildPlacement } from "@/lib/childcareOperational/childPlacementService";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/placements/cancel",
    operationId: "cancelPlacement",
    subject: "The placement",
    perform: async (body, ctx) => {
        const placement = requiredId(body, "placement_id");
        if (!placement.ok) return placement;

        const resolved = await resolveServiceStateRowInAuthority(ctx, "child_placements", placement.value);
        if (!resolved.ok) return resolved;

        const cancelled = await cancelChildPlacement(ctx.supabase, {
            orgId: ctx.organizationId,
            placementId: resolved.value.id,
        });
        return { ok: true, status: 200, result: toPlacementResult(cancelled as unknown as Record<string, unknown>) };
    },
});

/**
 * POST /api/v1/placements/move — move a child to a different room.
 *
 * SUPERSESSION, not an edit. The canonical service writes a new placement naming the one it
 * replaces and closes the prior row on the day before the move, so a partner that had already
 * synchronised the old placement receives the change rather than diverging silently.
 *
 * There is deliberately no `PATCH /placements/{id}`. The domain exports
 * `assertNoOperationalPlacementPatch()` — in-place mutation of an effective-dated row is refused
 * for every caller, Alloy's own surfaces included.
 */

import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import {
    optionalId,
    requiredDate,
    requiredId,
    resolveEnrollmentInAuthority,
    toPlacementResult,
} from "@/lib/platform/external/resources/serviceStateOperations";
import { supersedeChildPlacement } from "@/lib/childcareOperational/childPlacementService";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/placements/move",
    operationId: "movePlacement",
    subject: "The placement",
    perform: async (body, ctx) => {
        const enrollment = requiredId(body, "enrollment_id");
        if (!enrollment.ok) return enrollment;
        const startDate = requiredDate(body, "start_date");
        if (!startDate.ok) return startDate;
        const room = optionalId(body, "room_location_id");
        if (!room.ok) return room;
        const program = optionalId(body, "program_category_id");
        if (!program.ok) return program;

        const resolved = await resolveEnrollmentInAuthority(ctx, enrollment.value);
        if (!resolved.ok) return resolved;

        const moved = await supersedeChildPlacement(ctx.supabase, {
            orgId: ctx.organizationId,
            enrollmentAgreementId: resolved.value.agreementId,
            startDate: startDate.value,
            roomLocationId: room.value,
            programCategoryId: program.value,
            sourceKey: `external:${ctx.actorLabel}`,
            todayYmd: ctx.todayYmd,
        });
        return { ok: true, status: 201, result: toPlacementResult(moved as unknown as Record<string, unknown>) };
    },
});

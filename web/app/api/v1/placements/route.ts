/**
 * GET /api/v1/placements — committed, effective-dated room placement.
 *
 * Placement answers "which room, from when". Corrections are expressed by SUPERSESSION rather than
 * by editing history: a corrected placement is a new row naming the one it replaces, so a partner
 * that has already synchronised the old row learns of the change instead of silently diverging.
 *
 * Rooms are published as Location ids from the same topology `/api/v1/locations` exposes. There is
 * no second room vocabulary and no internal cohort key.
 */

import { externalCollectionRoute, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { toPublicPlacement } from "@/lib/platform/external/resources/serviceStateResources";
import {
    createOrConverge,
    optionalId,
    requiredDate,
    requiredId,
    resolveEnrollmentInAuthority,
    toPlacementResult,
} from "@/lib/platform/external/resources/serviceStateOperations";
import {
    createInitialChildPlacement,
    getOperationalPlacementForAgreement,
} from "@/lib/childcareOperational/childPlacementService";

export const dynamic = "force-dynamic";

export const GET = externalCollectionRoute({
    route: "/api/v1/placements",
    operationId: "listPlacements",
    subject: "placements",
    rpc: "list_external_placements",
    params: (params) => {
        const child = uuidFilter(params, "child_id");
        if (!child.ok) return child;
        const site = uuidFilter(params, "site_id");
        if (!site.ok) return site;
        const room = uuidFilter(params, "room_id");
        if (!room.ok) return room;
        return {
            ok: true,
            values: {
                p_child_id: child.value, p_site_id: site.value,
                p_room_id: room.value, p_status: params.get("status"),
            },
        };
    },
    toPublic: toPublicPlacement,
});

/**
 * POST /api/v1/placements — assign the first room placement for an enrollment.
 *
 * Converges: an operational placement already existing for this enrollment is returned rather than
 * duplicated. To CHANGE an existing placement, use `POST /api/v1/placements/move`, which
 * supersedes — placement history is never rewritten in place, and the domain refuses to.
 */
export const POST = externalOperationRoute({
    route: "/api/v1/placements",
    operationId: "assignPlacement",
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

        const existing = await getOperationalPlacementForAgreement(
            ctx.supabase,
            ctx.organizationId,
            resolved.value.agreementId,
        );
        if (existing) {
            return { ok: true, status: 200, result: toPlacementResult(existing as unknown as Record<string, unknown>) };
        }

        const outcome = await createOrConverge(
            () =>
                createInitialChildPlacement(ctx.supabase, {
                    orgId: ctx.organizationId,
                    enrollmentAgreementId: resolved.value.agreementId,
                    startDate: startDate.value,
                    roomLocationId: room.value,
                    programCategoryId: program.value,
                    sourceKey: `external:${ctx.actorLabel}`,
                    todayYmd: ctx.todayYmd,
                }),
            () => getOperationalPlacementForAgreement(ctx.supabase, ctx.organizationId, resolved.value.agreementId),
        );
        return {
            ok: true,
            status: outcome.created ? 201 : 200,
            result: toPlacementResult(outcome.row as unknown as Record<string, unknown>),
        };
    },
});

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminActionsOrgTag } from "@/lib/admin/actions/cacheTags";
import type { EnrollmentStatusDestinationKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import { UPDATE_ENROLLMENT_STATUS_ACTION_KEY } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import { executeEnrollmentStatusTransition } from "@/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition";
import { resolveEnrollmentStatusTransitionScope } from "@/lib/admin/enrollmentStatus/resolveEnrollmentStatusTransitionScope";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";

type Body = {
    opportunity_id?: string;
    destination_key?: EnrollmentStatusDestinationKey;
    target_status_key?: string | null;
    reason?: string | null;
    note?: string | null;
    bypass_reason?: string | null;
    source_surface?: string | null;
    scope?: {
        grain?: "case" | "child" | "candidate";
        opportunity_customer_member_id?: string | null;
        placement_candidate_id?: string | null;
    };
    context?: { department_id?: string | null; work_unit_id?: string | null };
};

/** POST — confirm and execute enrollment status transition (OCM-first). */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const opportunityId = body.opportunity_id?.trim() ?? "";
    const destinationKey = body.destination_key;
    if (!opportunityId || !destinationKey) {
        return NextResponse.json({ error: "opportunity_id and destination_key are required" }, { status: 400 });
    }

    const scope = resolveEnrollmentStatusTransitionScope({
        opportunityId,
        sourceSurface: "opportunity_drawer",
        rowGrain: body.scope?.grain ?? null,
        opportunityCustomerMemberId: body.scope?.opportunity_customer_member_id,
        placementCandidateId: body.scope?.placement_candidate_id,
    });

    const supabase = createAdminClient();
    const result = await executeEnrollmentStatusTransition({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        departmentId: body.context?.department_id,
        workUnitId: body.context?.work_unit_id,
        request: {
            actionKey: UPDATE_ENROLLMENT_STATUS_ACTION_KEY,
            scope,
            destinationKey,
            targetStatusKey: body.target_status_key?.trim() ?? "",
            confirmationRequired: true,
            reason: body.reason,
            note: body.note,
            bypassReason: body.bypass_reason,
            sourceSurface:
                body.source_surface === "queue_row" ||
                body.source_surface === "child_drawer" ||
                body.source_surface === "person_drawer" ||
                body.source_surface === "layout_button" ||
                body.source_surface === "bos_rail"
                    ? body.source_surface
                    : "opportunity_drawer",
        },
    });

    if (!result.ok) {
        return NextResponse.json(
            {
                ok: false,
                error: result.error,
                completion_requirements: result.validation,
                summary: formatRequirementValidationSummary(result.validation ?? { ok: false, blocking: [], warnings: [], recommendations: [] }),
            },
            { status: 400 },
        );
    }

    revalidateTag(adminActionsOrgTag(ctx.orgId), "max");

    return NextResponse.json({
        ok: true,
        execution_result: {
            kind: "update_enrollment_status",
            grain: result.grain,
            target_status_key: result.targetStatusKey,
            opportunity_customer_member_id: result.opportunityCustomerMemberId,
            placement_hook: result.placementHook,
        },
    });
}

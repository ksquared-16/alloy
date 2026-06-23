import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { evaluateEnrollmentStatusTransitionPreflight } from "@/lib/admin/enrollmentStatus/evaluateEnrollmentStatusTransitionPreflight";
import type { EnrollmentStatusDestinationKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import { resolveEnrollmentStatusTransitionScope } from "@/lib/admin/enrollmentStatus/resolveEnrollmentStatusTransitionScope";
import { formatRequirementValidationSummary } from "@/lib/completion/requirementValidationResult";
import { toBosCompletionRequirementPayload } from "@/lib/completion/bosIntegration";

type Body = {
    opportunity_id?: string;
    destination_key?: EnrollmentStatusDestinationKey;
    target_status_key?: string | null;
    bypass_reason?: string | null;
    scope?: {
        grain?: "case" | "child" | "candidate";
        opportunity_customer_member_id?: string | null;
        placement_candidate_id?: string | null;
    };
    context?: { department_id?: string | null; work_unit_id?: string | null };
};

/** POST — evaluate requirements for a proposed enrollment status transition. */
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
    const result = await evaluateEnrollmentStatusTransitionPreflight({
        supabase,
        orgId: ctx.orgId,
        scope,
        destinationKey,
        targetStatusKey: body.target_status_key,
        departmentId: body.context?.department_id,
        workUnitId: body.context?.work_unit_id,
        bypassReason: body.bypass_reason,
    });

    return NextResponse.json({
        ok: result.ok,
        target_status_key: result.targetStatusKey,
        requires_bypass_reason: result.requiresBypassReason,
        completion_requirements: result.validation,
        summary: result.ok ? null : formatRequirementValidationSummary(result.validation),
        bos_preflight: toBosCompletionRequirementPayload(result.validation),
        skipped_stage_labels: result.skippedStageLabels,
    });
}

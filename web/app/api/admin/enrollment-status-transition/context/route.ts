import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { loadEnrollmentStatusTransitionContext } from "@/lib/admin/enrollmentStatus/loadEnrollmentStatusTransitionContext";
import {
    resolveEnrollmentStatusTransitionScope,
    type ResolveEnrollmentScopeInput,
} from "@/lib/admin/enrollmentStatus/resolveEnrollmentStatusTransitionScope";
import type { EnrollmentStatusTransitionSourceSurface } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";

type Body = {
    opportunity_id?: string;
    source_surface?: EnrollmentStatusTransitionSourceSurface;
    department_id?: string | null;
    scope?: ResolveEnrollmentScopeInput & { builder_stage_key?: string | null };
};

/** POST — load child options, current status, and destination list for the modal. */
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
    if (!opportunityId) {
        return NextResponse.json({ error: "opportunity_id is required" }, { status: 400 });
    }

    const scope = resolveEnrollmentStatusTransitionScope({
        opportunityId,
        sourceSurface: body.source_surface ?? "opportunity_drawer",
        ...body.scope,
    });

    const supabase = createAdminClient();
    const context = await loadEnrollmentStatusTransitionContext(supabase, ctx.orgId, scope, {
        departmentId: body.department_id,
        builderStageKey: body.scope?.builder_stage_key,
    });
    return NextResponse.json({ ok: true, context });
}

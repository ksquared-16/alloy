import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { resolveActionEligibility } from "@/lib/adminV2/actions/actionExecutor";

type EligibilityBody = {
    action_key?: string;
    entity_type?: string;
    entity_id?: string;
    context?: {
        surface?: string;
        department_id?: string | null;
        work_unit_id?: string | null;
        section_key?: string | null;
        process_key?: string | null;
        origin?: "manual" | "bos" | "workflow";
    };
    payload?: Record<string, unknown>;
    include_preview?: boolean;
};

/**
 * POST /api/admin/actions/eligibility — read-only eligibility + (optional) preview for a
 * registered action. Used by manual UI and BOS to gate/confirm before execute.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    let body: EligibilityBody;
    try {
        body = (await request.json()) as EligibilityBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const actionKey = body.action_key != null ? String(body.action_key).trim() : "";
    const entityType = body.entity_type != null ? String(body.entity_type).trim() : "";
    if (!actionKey || !entityType) {
        return NextResponse.json({ error: "action_key and entity_type are required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const response = await resolveActionEligibility(
        supabase,
        { orgId: ctx.orgId, userId: ctx.userId, accessScope: scopeDimensionsFromAccess(access) },
        {
            actionKey,
            entityType,
            entityId: body.entity_id != null ? String(body.entity_id).trim() : "",
            context: body.context,
            payload: body.payload,
        },
        { includePreview: body.include_preview === true }
    );

    return NextResponse.json({ ok: true, ...response });
}

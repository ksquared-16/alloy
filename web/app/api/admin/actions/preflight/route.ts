import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { runOpportunityActionPreflight } from "@/lib/admin/actions/adminActionPreflight";
import { effectiveRequirementsToValidationResult } from "@/lib/completion/evaluateEffectiveRequirements";
import { toBosCompletionRequirementPayload } from "@/lib/completion/bosIntegration";

type PreflightBody = {
    action_key?: string;
    entity_type?: string;
    entity_id?: string;
    context?: { department_id?: string | null; work_unit_id?: string | null };
    payload?: Record<string, unknown>;
};

/** POST /api/admin/actions/preflight — evaluate action execute requirements without mutating. */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: PreflightBody;
    try {
        body = (await request.json()) as PreflightBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const actionKey = body.action_key != null ? String(body.action_key).trim() : "";
    const entityType = body.entity_type != null ? String(body.entity_type).trim() : "";
    const entityId = body.entity_id != null ? String(body.entity_id).trim() : "";

    if (!actionKey || !entityType || !entityId) {
        return NextResponse.json({ error: "action_key, entity_type, and entity_id are required" }, { status: 400 });
    }

    const norm = entityType.toLowerCase();
    if (norm !== "opportunity" && norm !== "opportunities") {
        return NextResponse.json({ error: "Only opportunity preflight is supported in v1" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const effective = await runOpportunityActionPreflight({
        supabase,
        orgId: ctx.orgId,
        opportunityId: entityId,
        actionKey,
        payload: body.payload,
        departmentId: body.context?.department_id,
        workUnitId: body.context?.work_unit_id,
    });

    const validation = effectiveRequirementsToValidationResult(effective);

    return NextResponse.json({
        ok: effective.ok,
        effective_requirements: effective,
        completion_requirements: validation,
        bos_preflight: toBosCompletionRequirementPayload(validation),
        executable: effective.ok,
    });
}

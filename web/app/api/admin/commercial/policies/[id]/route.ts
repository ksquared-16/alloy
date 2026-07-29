import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { validateCommercialPolicyValue, type CommercialPolicyType } from "@/lib/commercial/execution/policy/policyTypes";
import { operatorFriendlyCommercialError } from "@/lib/commercial/operatorFriendlyCommercialError";
import { SELECT_COLS, mapPolicyRow, resolveScopeColumns } from "@/app/api/admin/commercial/policies/route";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await params;
    let body: Record<string, unknown> = {};
    try { body = (await request.json()) as Record<string, unknown>; }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const supabase = createAdminClient();
    const { data: existing } = await supabase.from("commercial_policies").select("policy_type").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    const policyType = (existing as { policy_type: CommercialPolicyType }).policy_type;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("label" in body) patch.label = body.label != null ? String(body.label).trim() || null : null;
    if ("description" in body) patch.description = body.description != null ? String(body.description).trim() || null : null;
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

    if (body.value !== undefined) {
        const rawValue = body.value != null && typeof body.value === "object" && !Array.isArray(body.value) ? (body.value as Record<string, unknown>) : {};
        const validated = validateCommercialPolicyValue(policyType, rawValue);
        if (!validated.ok) return NextResponse.json({ error: validated.error.message, field: validated.error.field }, { status: 400 });
        patch.value = validated.value;
    }

    if (body.scope_type !== undefined) {
        const scope = resolveScopeColumns(body);
        if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: 400 });
        Object.assign(patch, scope.cols);
    }

    if ("effective_start" in body) patch.effective_start = String(body.effective_start ?? "").trim() || "2000-01-01";
    if ("effective_end" in body) patch.effective_end = String(body.effective_end ?? "").trim() || null;
    if (body.metadata !== undefined && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
        patch.metadata = body.metadata;
    }
    if (patch.effective_start && patch.effective_end && String(patch.effective_end) < String(patch.effective_start)) {
        return NextResponse.json({ error: "end date must be on or after the start date" }, { status: 400 });
    }

    if (Object.keys(patch).length <= 1) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const { data, error } = await supabase.from("commercial_policies").update(patch).eq("id", id).eq("org_id", ctx.orgId).select(SELECT_COLS).maybeSingle();
    if (error) {
        return NextResponse.json(
            { error: operatorFriendlyCommercialError(error.message, "Could not update policy.") },
            { status: error.code === "23505" ? 409 : 400 },
        );
    }
    if (!data) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    return NextResponse.json({ policy: mapPolicyRow(data as Record<string, unknown>) });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await params;
    const supabase = createAdminClient();
    const { data: existing } = await supabase.from("commercial_policies").select("id").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

    const { error } = await supabase.from("commercial_policies").delete().eq("id", id).eq("org_id", ctx.orgId);
    if (error) {
        return NextResponse.json(
            { error: operatorFriendlyCommercialError(error.message, "Could not delete policy.") },
            { status: 400 },
        );
    }
    return NextResponse.json({ deleted: true });
}

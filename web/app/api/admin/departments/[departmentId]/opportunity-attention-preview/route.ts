import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { loadDeptAttentionPreviewServer } from "@/lib/workspace/loadDeptAttentionPreviewServer";

/**
 * GET — Needs attention preview for a department.
 *
 * **Default / recommended:** resolve `needs_attention` work unit for this department (or pass `work_unit_id`)
 * and return **work-unit-scoped** bucket counts aligned with execution (`needs_attention` queue list cap).
 *
 * **Legacy fallback:** when no work unit can be resolved, uses org-wide capped preview (`bucket_count_scope=org_preview_cap_500`).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "departments", departmentId, gate.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (gate.dim.departmentScope === "restricted") {
        const allowed = gate.dim.allowedDepartmentIds ?? [];
        if (!allowed.includes(departmentId)) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    try {
        const { data: deptRow } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", departmentId)
            .eq("org_id", gate.orgId)
            .maybeSingle();
        const departmentMetadata = (deptRow as { metadata?: unknown } | null)?.metadata ?? null;
        const workUnitIdParam = (request.nextUrl.searchParams.get("work_unit_id") ?? "").trim() || null;

        const payload = await loadDeptAttentionPreviewServer({
            supabase,
            orgId: gate.orgId,
            departmentId,
            departmentMetadata,
            accessDim: gate.dim,
            workUnitIdParam,
        });
        return NextResponse.json(payload);
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { attachMatchingRecordsToLifecycleWorkUnits } from "@/lib/lifecycle/attachLifecycleWorkUnitRecords";
import { BUSINESS_PROCESS_ACTIVATE, requireBusinessProcessCapability } from "@/lib/access/businessProcessAuthority";

/** POST — attach existing opportunities (by status) to lifecycle_wu_* work units (builder-owned only). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireBusinessProcessCapability(ctx, BUSINESS_PROCESS_ACTIVATE);
    if (denied) return denied;

    let body: { department_id?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const departmentId = typeof body.department_id === "string" ? body.department_id.trim() : "";
    if (!departmentId) {
        return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await attachMatchingRecordsToLifecycleWorkUnits(supabase, ctx.orgId, departmentId);
    if (!result.ok) {
        return NextResponse.json({ error: result.error, actions: result.actions ?? [] }, { status: 400 });
    }

    return NextResponse.json({
        ok: true,
        department_id: result.department_id,
        attached_total: result.attached_total,
        by_stage: result.by_stage,
        actions: result.actions,
    });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { buildLifecycleCatalog, catalogEntryForProcess } from "@/lib/lifecycle/lifecycleCatalog";
import { repairLifecycleWorkspaceVisibility } from "@/lib/lifecycle/repairLifecycleWorkspaceVisibility";

/** POST — repair workspace tile visibility for a catalog lifecycle. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    let body: { department_id?: string; process_id?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const departmentId = typeof body.department_id === "string" ? body.department_id.trim() : "";
    const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
    if (!departmentId || !processId) {
        return NextResponse.json({ error: "department_id and process_id are required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await repairLifecycleWorkspaceVisibility(
        supabase,
        ctx.orgId,
        departmentId,
        processId,
        dim,
        access.userId
    );
    if (!result.ok) {
        return NextResponse.json({ error: result.error, actions: result.actions ?? [] }, { status: 400 });
    }

    const items = await buildLifecycleCatalog(supabase, ctx.orgId, dim);
    const entry = catalogEntryForProcess(items, result.department_id, processId);

    return NextResponse.json({
        ok: true,
        department_id: result.department_id,
        process_id: processId,
        actions: result.actions,
        entry,
    });
}

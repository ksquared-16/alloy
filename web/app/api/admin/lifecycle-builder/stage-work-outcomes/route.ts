import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { getOperationalTaskById } from "@/lib/admin/operationalTasksService";
import { resolveStageWorkOutcomeContext } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";

/** GET — resolve outcome picker options for a lifecycle stage work task. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const taskId = request.nextUrl.searchParams.get("task_id")?.trim() ?? "";
    const departmentId = request.nextUrl.searchParams.get("department_id")?.trim() ?? "";

    if (!taskId) {
        return NextResponse.json({ error: "task_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const taskRes = await getOperationalTaskById({ supabase, orgId: ctx.orgId, taskId });
    if (!taskRes.ok) {
        return NextResponse.json({ error: taskRes.message }, { status: taskRes.status ?? 404 });
    }

    const outcomeContext = await resolveStageWorkOutcomeContext({
        supabase,
        orgId: ctx.orgId,
        task: taskRes.row,
        departmentId: departmentId || null,
    });

    if (!outcomeContext) {
        return NextResponse.json({ ok: true, requires_outcome_picker: false });
    }

    if (!departmentIdAllowed(dim, outcomeContext.department_id)) {
        return NextResponse.json({ error: "Department not in scope" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...outcomeContext });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { auditLifecycleDepartmentPersistence } from "@/lib/lifecycle/auditLifecyclePersistence";

export const dynamic = "force-dynamic";

/** GET — DB/API truth for a lifecycle runtime department (after create or repair). */
export async function GET(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { departmentId } = await context.params;
    const processId = request.nextUrl.searchParams.get("process_id");

    try {
        const supabase = createAdminClient();
        const audit = await auditLifecycleDepartmentPersistence(
            supabase,
            gate.orgId,
            departmentId,
            gate.dim,
            processId
        );
        return NextResponse.json({ audit });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Audit failed" }, { status: 500 });
    }
}

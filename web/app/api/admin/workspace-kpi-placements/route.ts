import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";

export const dynamic = "force-dynamic";

/** Placement rows only (no computed KPI values). Org-scoped. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const surface = (request.nextUrl.searchParams.get("surface") ?? "").trim().toLowerCase();
    const departmentId = (request.nextUrl.searchParams.get("department_id") ?? "").trim();
    const workUnitId = (request.nextUrl.searchParams.get("work_unit_id") ?? "").trim();

    if (surface !== "workspace" && surface !== "department" && surface !== "work_unit") {
        return NextResponse.json({ error: "Invalid surface" }, { status: 400 });
    }
    if (surface === "department" && !departmentId) {
        return NextResponse.json({ error: "department_id required for surface=department" }, { status: 400 });
    }
    if (surface === "work_unit" && (!departmentId || !workUnitId)) {
        return NextResponse.json(
            { error: "department_id and work_unit_id required for surface=work_unit" },
            { status: 400 }
        );
    }
    if (surface === "workspace" && (departmentId || workUnitId)) {
        return NextResponse.json({ error: "workspace surface must not include department_id or work_unit_id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    let q = supabase
        .from("workspace_kpi_placement")
        .select(
            "id, org_id, surface, department_id, work_unit_id, metric_key, display_order, is_visible, label_override, format_override, lane_override, metadata, created_at, updated_at"
        )
        .eq("org_id", ctx.orgId)
        .eq("surface", surface)
        .eq("is_visible", true)
        .order("display_order", { ascending: true })
        .order("metric_key", { ascending: true });

    if (surface === "workspace") {
        q = q.is("department_id", null).is("work_unit_id", null);
    } else if (surface === "department") {
        q = q.eq("department_id", departmentId).is("work_unit_id", null);
    } else {
        q = q.eq("department_id", departmentId).eq("work_unit_id", workUnitId);
    }

    const { data, error } = await q;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data ?? []) as WorkspaceKpiPlacementRow[];
    return NextResponse.json({ items });
}

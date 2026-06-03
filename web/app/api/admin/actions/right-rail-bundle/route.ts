import { NextRequest, NextResponse } from "next/server";
import type { ActionSurface } from "@/lib/admin/actions/types";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { loadRightRailActionsBundleServer } from "@/lib/workspace/loadRightRailActionsBundleServer";

/**
 * GET — Resolve right_rail + work_unit + department action surfaces in one auth pass.
 */
export async function GET(request: NextRequest) {
    const t0 = Date.now();
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const departmentId = (request.nextUrl.searchParams.get("department_id") ?? "").trim();
    const workUnitId = (request.nextUrl.searchParams.get("work_unit_id") ?? "").trim();
    const surfacesRaw = (request.nextUrl.searchParams.get("surfaces") ?? "").trim();
    const placementSurfaces = surfacesRaw
        ? (surfacesRaw
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean) as ActionSurface[])
        : undefined;
    if (!departmentId || !workUnitId) {
        return NextResponse.json({ error: "department_id and work_unit_id required" }, { status: 400 });
    }

    try {
        const actions = await loadRightRailActionsBundleServer({
            orgId: gate.orgId,
            departmentId,
            workUnitId,
            placementSurfaces,
        });
        const ms = Date.now() - t0;
        if (ms > 120) {
            console.warn("[admin-timing] GET /api/admin/actions/right-rail-bundle", {
                ms,
                department_id: departmentId,
                work_unit_id: workUnitId,
                action_count: actions.length,
            });
        }
        return NextResponse.json({ actions });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

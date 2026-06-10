import { NextResponse } from "next/server";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { loadWorkspaceRootActionsServer } from "@/lib/workspace/loadWorkspaceRootActionsServer";

/** GET — Resolve `surface=workspace` action placements for /workspace root command rail. */
export async function GET() {
    const t0 = Date.now();
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    try {
        const actions = await loadWorkspaceRootActionsServer({ orgId: gate.orgId });
        const ms = Date.now() - t0;
        if (ms > 120) {
            console.warn("[admin-timing] GET /api/admin/actions/workspace-root-bundle", {
                ms,
                action_count: actions.length,
            });
        }
        return NextResponse.json({ actions });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

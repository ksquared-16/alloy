import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { buildLifecycleCatalog } from "@/lib/lifecycle/lifecycleCatalog";

export const dynamic = "force-dynamic";

/** GET — all lifecycles (legacy + builder-owned) with workspace visibility. */
export async function GET() {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    try {
        const supabase = createAdminClient();
        const items = await buildLifecycleCatalog(supabase, gate.orgId, gate.dim);
        return NextResponse.json(
            { items },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            }
        );
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load catalog" }, { status: 500 });
    }
}

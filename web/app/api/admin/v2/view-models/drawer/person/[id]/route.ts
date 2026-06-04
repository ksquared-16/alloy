import { NextRequest, NextResponse } from "next/server";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { composePersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/composePersonDrawerViewModel";
import { parsePersonDrawerVmComposeDepth } from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmComposeDepth";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const routeT0 = Date.now();
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { id: personId } = await context.params;
    if (!personId?.trim()) {
        return NextResponse.json({ error: "Missing person id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const personOrg = await assertRowOrg(supabase, "persons", personId, gate.orgId);
    if (!personOrg.ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const sp = request.nextUrl.searchParams;
    try {
        const result = await composePersonDrawerViewModel({
            supabase,
            gate,
            personId: personId.trim(),
            openSource: sp.get("open_source"),
            presentationEmphasis: sp.get("presentation_emphasis"),
            composeDepth: parsePersonDrawerVmComposeDepth(sp.get("compose_depth")),
        });

        if (!result.ok) {
            return NextResponse.json(result.skipped, {
                status: 422,
                headers: {
                    "X-Alloy-Drawer-VM-Structure-Settled": "false",
                    "X-Alloy-Server-Duration": String(Date.now() - routeT0),
                },
            });
        }

        return NextResponse.json(result.viewModel, {
            headers: {
                "X-Alloy-Drawer-VM-Structure-Settled": "true",
                "X-Alloy-Drawer-VM-Generation": result.viewModel.generation,
                "X-Alloy-Drawer-VM-Compose-Ms": String(result.viewModel.timing.compose_ms),
                "X-Alloy-Server-Duration": String(Date.now() - routeT0),
            },
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Person drawer view model compose failed";
        console.error("[person_drawer_vm_compose_error]", {
            person_id: personId.trim(),
            message: msg,
            stack: e instanceof Error ? e.stack : undefined,
        });
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

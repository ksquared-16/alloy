/** Recent API activity. The service's narrow column list is the safety boundary. */
import { NextRequest, NextResponse } from "next/server";

import { requireIntegrationsAccess } from "../../../_guard";
import { getInstallation, listActivity, type ActivityFilter } from "@/lib/platform/admin/integrationsService";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const gate = await requireIntegrationsAccess("viewActivity");
    if (!gate.ok) return gate.response;
    const { id } = await params;

    // Tenancy first: activity for an installation in another organization must be
    // indistinguishable from an installation that does not exist.
    const owned = await getInstallation(gate.ctx.supabase, gate.ctx.orgId, id);
    if (!owned.ok) return NextResponse.json({ error: owned.message }, { status: owned.status });

    const raw = new URL(request.url).searchParams.get("filter");
    const filter: ActivityFilter = raw === "success" || raw === "failure" ? raw : "all";

    const result = await listActivity(gate.ctx.supabase, gate.ctx.orgId, id, { filter });
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });
    return NextResponse.json({ entries: result.entries, filter });
}

/** The applications an operator may connect. A chooser, not tenant CRUD. */
import { NextResponse } from "next/server";

import { requireIntegrationsAccess } from "../_guard";
import { listApprovedApplications } from "@/lib/platform/admin/integrationsService";

export async function GET() {
    const gate = await requireIntegrationsAccess("createInstallation");
    if (!gate.ok) return gate.response;

    const result = await listApprovedApplications(gate.ctx.supabase, gate.ctx.orgId);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });
    return NextResponse.json({ applications: result.applications });
}

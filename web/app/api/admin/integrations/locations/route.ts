/**
 * The locations an operator may grant.
 *
 * Served by `list_external_locations`, the same function the public API and the
 * attendance authority adapter use, so the chooser cannot offer something the
 * boundary would refuse. Address, customer and vendor premises are excluded in
 * SQL — never by the client remembering to filter.
 */
import { NextResponse } from "next/server";

import { requireIntegrationsAccess } from "../_guard";
import { listGrantableLocations } from "@/lib/platform/admin/integrationsService";

export async function GET() {
    const gate = await requireIntegrationsAccess("editAccess");
    if (!gate.ok) return gate.response;

    const result = await listGrantableLocations(gate.ctx.supabase, gate.ctx.orgId);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });
    return NextResponse.json({ locations: result.locations });
}

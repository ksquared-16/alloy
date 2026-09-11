/**
 * Organization → Integrations: the collection.
 *
 * Authorizes independently. Hiding the navigation entry is a courtesy; this is
 * the control, and a route that renders nothing without calling
 * `authorizeIntegrationsAdmin` is unprotected.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { authorizeIntegrationsAdmin } from "@/lib/platform/admin/integrationsAdminAuth";
import { listInstallations, presentScopes } from "@/lib/platform/admin/integrationsService";

export async function GET(_request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: ctx.status });

    const supabase = createAdminClient();
    const verdict = await authorizeIntegrationsAdmin(supabase, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        operation: "listInstallations",
    });
    if (!verdict.ok) {
        return NextResponse.json({ error: verdict.message, code: verdict.code }, { status: verdict.status });
    }

    const result = await listInstallations(supabase, ctx.orgId);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });

    return NextResponse.json({
        installations: result.installations.map((i) => ({
            ...i,
            capabilities: presentScopes(i.grantedScopes),
        })),
    });
}

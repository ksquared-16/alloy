import { NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readUnrecognizedCollections } from "@/lib/financials/payments/collectionRecognition";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financials/needs-recognition
 *
 * Which provider-confirmed collections still need Alloy to recognize the money.
 *
 * READ ONLY. Recognizing is a registered action behind `fin.write`; SEEING the queue is an ordinary
 * Financials read. The organization comes from the authenticated gate and never from the query, so
 * one tenant cannot ask about another's unrecorded money.
 */
export const dynamic = "force-dynamic";

export async function GET() {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;

    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    try {
        const rows = await readUnrecognizedCollections(supabase, { orgId: ctx.orgId });
        return NextResponse.json({ ok: true, rows });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "The recognition queue could not be read." },
            { status: 500 },
        );
    }
}

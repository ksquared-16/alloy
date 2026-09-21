import { NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readLiveArrangement } from "@/lib/financials/payments/autopayArrangement";
import { resolveAutopayCollectible } from "@/lib/financials/payments/autopayCollectible";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financials/autopay?customer_id=…
 *
 * What is authorized on one account, and what it would collect today.
 *
 * READ ONLY, and deliberately so. Enrolling, pausing, resuming and revoking are registered actions
 * behind `fin.write` and go through the ordinary action runtime; a route that also mutated would be
 * a second authority over a family's standing consent. `fin.read` cannot change anything here.
 *
 * The AMOUNT DUE is resolved live rather than stored, which is the same rule the handler follows.
 * A figure cached on the arrangement would be a shadow balance, and the surface would show a family
 * a number they had already paid.
 *
 * The ORGANIZATION comes from the authenticated gate and never from the query.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

    const customerId = (new URL(request.url).searchParams.get("customer_id") ?? "").trim();
    if (!customerId) {
        return NextResponse.json({ error: "An account is required." }, { status: 400 });
    }

    try {
        const arrangement = await readLiveArrangement(supabase, { orgId: ctx.orgId, customerId });

        /*
         * Only asked when an arrangement exists. An account with no Autopay has no timing policy to
         * evaluate against, and answering "what would Autopay collect" for it would be inventing one.
         */
        const collectible = arrangement
            ? await resolveAutopayCollectible(supabase, {
                  orgId: ctx.orgId,
                  customerId,
                  timingOffsetDays: arrangement.timingOffsetDays,
                  asOf: new Date().toISOString().slice(0, 10),
              })
            : null;

        return NextResponse.json({
            arrangement,
            amountDueCents: collectible?.totalCents ?? null,
            nextDueDate: collectible?.nextDueDate ?? null,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Autopay could not be read." },
            { status: 500 },
        );
    }
}

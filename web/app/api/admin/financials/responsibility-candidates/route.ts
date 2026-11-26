import { NextResponse } from "next/server";

import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { resolveResponsibilityPartyCandidates } from "@/lib/financials/responsibility/responsibilityPartyCandidates";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/responsibility-candidates?customer_id=…[&charge_id=…]
 *
 * WHO THIS ACCOUNT'S OBLIGATION COULD BE PUT ON. One normalized shape, one owner: the resolver
 * decides, this route resolves the caller's org and asks.
 *
 * WHY IT IS NOT `contact-options`. That route means "the contacts recorded on this account" and
 * other surfaces depend on it meaning exactly that. Responsibility asks a different question —
 * which PEOPLE attached to this household may bear money, plus anyone already bearing it whether or
 * not they are still attached. Overloading the older contract to answer both would have made every
 * existing caller's result depend on a financial rule it never asked about.
 *
 * ── THIS LIST IS NOT THE AUTHORIZATION ──
 *
 * `arrangementService` independently refuses any party that is not a `persons` row in the caller's
 * org. Omitting somebody here does not protect anything and including somebody grants nothing; the
 * list narrows 1,821 people to a decidable few. The org comes from the resolved gate and never from
 * the request, so `customer_id` can only ever name an account inside the caller's own tenant — a
 * foreign or invented one resolves to nobody, which is also what an empty household answers.
 *
 * Reading who could be responsible is `fin.read`. This route executes nothing.
 */
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

    const url = new URL(request.url);
    const customerId = (url.searchParams.get("customer_id") ?? "").trim();
    const chargeId = (url.searchParams.get("charge_id") ?? "").trim();

    try {
        const candidates = await resolveResponsibilityPartyCandidates(supabase, {
            orgId: ctx.orgId,
            customerId: customerId || null,
            chargeIds: chargeId ? [chargeId] : [],
        });
        return NextResponse.json({ ok: true, candidates });
    } catch (e) {
        /* A read that could not be answered says so. An empty list would read as "nobody is
           eligible", and the operator would believe it. */
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
}

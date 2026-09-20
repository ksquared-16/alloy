import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readAccountArrangement } from "@/lib/financials/responsibility/readAccountArrangement";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/responsibility-arrangement?customer_id=…[&customer_member_id=…]
 *
 * WHICH ARRANGEMENT GOVERNS A STATED SCOPE — so an operator administering responsibility can see
 * what is already in force before they replace it.
 *
 * ── WHY A ROUTE AND NOT A COMPONENT CALCULATION ───────────────────────────────────────────────
 *
 * Specificity is canonical: a child-scoped arrangement beats the household one for that child, and
 * `arrangementSpecificity` is the single authority that says so. The management card must not
 * reimplement that in React — two answers to "who owes" is the defect this thread just removed
 * from the read path, and re-introducing it in the surface that WRITES would be worse.
 *
 * So the route asks the same grain-aware reader every other consumer asks, and returns what it
 * says. It resolves nothing of its own.
 *
 * ── AUTHORED HERE vs INHERITED ────────────────────────────────────────────────────────────────
 *
 * Asking about a child returns the arrangement in force FOR that child, which may be the
 * household's. The caller must be able to tell those apart or it will show inherited household
 * money as though the child had been given it deliberately — so the answer states the grain it was
 * authored at, and `authoredAtRequestedScope` says plainly whether this scope has one of its own.
 *
 * READ ONLY. Configuration goes through `billing.configure_responsibility`, as it always has.
 * `fin.read`, like every other Financials read.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    const params = request.nextUrl.searchParams;
    const customerId = (params.get("customer_id") ?? "").trim();
    if (!customerId) return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    /* Absent means the HOUSEHOLD grain. It is never inferred from an empty selection elsewhere. */
    const raw = (params.get("customer_member_id") ?? "").trim();
    const customerMemberId = raw ? raw : null;

    try {
        const arrangement = await readAccountArrangement(supabase, { orgId: ctx.orgId, customerId, customerMemberId });
        return NextResponse.json({
            requestedScope: customerMemberId ? { grain: "child", customerMemberId } : { grain: "household" },
            arrangement,
            /*
             * The distinction the card turns into a sentence: an arrangement authored AT the scope
             * asked about, versus the household's arrangement reaching a child that has none.
             */
            authoredAtRequestedScope: arrangement ? arrangement.customerMemberId === customerMemberId : false,
        });
    } catch (e) {
        /* FAIL CLOSED. "No arrangement" is what invites an operator to create one. */
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

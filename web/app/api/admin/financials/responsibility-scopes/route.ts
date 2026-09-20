import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readHouseholdScopes } from "@/lib/financials/responsibility/readHouseholdScopes";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/responsibility-scopes?customer_id=…
 *
 * The household's children, so Manage responsibility can offer the scopes an operator may author
 * an arrangement for. Canonical membership, not ledger activity: a child with no charge yet is
 * exactly the one responsibility is most likely being set up for.
 *
 * READ ONLY. `fin.read`, like every other Financials read.
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
    /*
     * EITHER WAY IN. Financials Details holds the household and asks with `customer_id`.
     * Assignment holds a CHILD and no household id at all — so rather than teaching the assignment
     * surface to resolve households (a second place that would have to be right about it), the
     * child is accepted here and `customer_members` answers, which is the same column
     * `resolveBillableSourceHouseholdId` trusts for exactly this reason.
     */
    const params = request.nextUrl.searchParams;
    let customerId = (params.get("customer_id") ?? "").trim();
    const viaMemberId = (params.get("customer_member_id") ?? "").trim();
    if (!customerId && !viaMemberId) {
        return NextResponse.json({ error: "customer_id or customer_member_id is required" }, { status: 400 });
    }
    try {
        if (!customerId) {
            const { data, error } = await supabase
                .from("customer_members")
                .select("customer_id")
                .eq("org_id", ctx.orgId)
                .eq("id", viaMemberId)
                .maybeSingle();
            if (error) throw new Error(`household could not be resolved (${error.message.trim()})`);
            customerId = ((data as { customer_id?: string | null } | null)?.customer_id ?? "").trim();
            /* A child with no household is not an error — it is a family this cannot arrange for. */
            if (!customerId) return NextResponse.json({ customerId: null, members: [] });
        }
        return NextResponse.json({
            /* Returned so the caller that asked by child can address the household it belongs to. */
            customerId,
            members: await readHouseholdScopes(supabase, { orgId: ctx.orgId, customerId }),
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

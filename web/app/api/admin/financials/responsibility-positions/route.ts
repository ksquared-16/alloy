import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { readAccountArrangement } from "@/lib/financials/responsibility/readAccountArrangement";
import { readHouseholdScopes } from "@/lib/financials/responsibility/readHouseholdScopes";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financials/responsibility-positions?customer_id=…
 *
 * WHO OWES, PER CHILD — the one read a compact Details row needs, and the one nothing answered.
 *
 * ── WHY THIS EXISTS BESIDE `responsibility-arrangement` ───────────────────────────────────────
 *
 * That route answers ONE scope, which is exactly right for the management card: it asks about the
 * scope the operator is editing. A compact row has to name every child in the household once, and
 * getting there through the single-scope route means N+1 sequential round trips on the way to a
 * line of text — the operator watches a summary arrive one child at a time.
 *
 * So this asks the SAME grain-aware reader for every scope at once. It resolves nothing of its own
 * and it is not a second projection: `readAccountArrangement` remains the only authority on which
 * arrangement governs a scope, `readHouseholdScopes` remains the only authority on which children
 * a household has, and this route puts one question to both.
 *
 * ── ONE CHILD'S ANSWER IS NEVER ANOTHER'S ─────────────────────────────────────────────────────
 *
 * Every child is asked about separately, and the answer states whether the arrangement was
 * authored AT that child or INHERITED from the household. A summary that quietly reused one
 * child's arrangement for a sibling would read as deliberate and be wrong about real money — and
 * it is precisely the shortcut a row rendering "per child" invites.
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

    const customerId = (request.nextUrl.searchParams.get("customer_id") ?? "").trim();
    if (!customerId) return NextResponse.json({ error: "customer_id is required" }, { status: 400 });

    try {
        const members = await readHouseholdScopes(supabase, { orgId: ctx.orgId, customerId });
        /*
         * CONCURRENT, BECAUSE THEY ARE INDEPENDENT QUESTIONS. Each child's governing arrangement is
         * resolved without reference to any other, so asking them in series buys nothing but
         * latency on a row the operator reads before doing anything.
         */
        const positions = await Promise.all(
            members.map(async (member) => {
                const arrangement = await readAccountArrangement(supabase, {
                    orgId: ctx.orgId,
                    customerId,
                    customerMemberId: member.customerMemberId,
                });
                return {
                    customerMemberId: member.customerMemberId,
                    label: member.label,
                    /*
                     * The distinction a compact row must not lose: a child with its own arrangement
                     * has been given one deliberately; a child covered by the household's has not.
                     */
                    authoredAtChild: arrangement ? arrangement.customerMemberId === member.customerMemberId : false,
                    effectiveStart: arrangement?.effectiveStart ?? null,
                    shares: (arrangement?.shares ?? []).map((share) => ({
                        name: share.name,
                        method: share.method,
                        amountCents: share.amountCents,
                        percentBasisPoints: share.percentBasisPoints,
                    })),
                };
            }),
        );

        /* The household's own arrangement, so a row can say what "Household" actually means. */
        const household = await readAccountArrangement(supabase, { orgId: ctx.orgId, customerId, customerMemberId: null });

        return NextResponse.json({
            customerId,
            household: household
                ? {
                      effectiveStart: household.effectiveStart,
                      shares: household.shares.map((share) => ({
                          name: share.name,
                          method: share.method,
                          amountCents: share.amountCents,
                          percentBasisPoints: share.percentBasisPoints,
                      })),
                  }
                : null,
            positions,
        });
    } catch (e) {
        /* FAIL CLOSED. A summary that silently says nothing is read as "nobody owes". */
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

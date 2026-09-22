import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";

/**
 * GET /api/admin/financials/card?customer_id=…&customer_member_id=…&date=…
 *
 * ONE composed VM for all three Financials densities. The alternative was six client calls — charges,
 * allocations, GL configuration, templates, period, payment setup — and the card would have rendered
 * a balance before it knew the discounts, which is the one thing a financial surface must never do.
 *
 * The org comes from the authenticated session, never the query, so a household id from another
 * tenant resolves to nothing rather than to that tenant's ledger.
 */
export async function GET(request: NextRequest) {
    /*
     * ── WHERE THE SECONDS GO ──────────────────────────────────────────────────────────────────
     *
     * Opening Details waits on this one request, and the wait was reported as "several seconds"
     * before anyone knew which part was slow. Guessing at that is how a read gets a cache it does
     * not need. These marks are published as `Server-Timing`, which the browser records natively
     * and any probe can read, so the decomposition is a measurement rather than an argument.
     */
    const t0 = performance.now();
    const marks: Array<[string, number]> = [];
    let last = t0;
    const mark = (name: string) => {
        const now = performance.now();
        marks.push([name, now - last]);
        last = now;
    };

    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    mark("auth");

    const allowedRead = await assertFinancialsReadAllowed({
        supabase: createAdminClient(),
        orgId: ctx.orgId,
        userId: ctx.userId,
    });
    if (!allowedRead.ok) {
        return NextResponse.json(
            { error: allowedRead.message, required_permission: allowedRead.requiredPermission },
            { status: 403 },
        );
    }
    mark("perm");

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id")?.trim() || null;
    const customerMemberId = searchParams.get("customer_member_id")?.trim() || null;
    if (!customerId && !customerMemberId) {
        return NextResponse.json(
            { error: "customer_id or customer_member_id is required" },
            { status: 400 },
        );
    }

    try {
        const vm = await buildFinancialsCardVM(createAdminClient(), {
            orgId: ctx.orgId,
            customerId,
            customerMemberId,
            today: searchParams.get("date")?.trim() || null,
            mark,
        });
        mark("read");
        const body = JSON.stringify({ ok: true, vm });
        mark("serialize");
        return new NextResponse(body, {
            status: 200,
            headers: {
                "content-type": "application/json",
                "cache-control": "no-store",
                "server-timing": marks
                    .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)
                    .concat(`total;dur=${(performance.now() - t0).toFixed(1)}`)
                    .join(", "),
            },
        });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}

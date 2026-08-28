import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { buildAttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/attendance/card?customer_member_id=…&date=…
 *
 * ONE composed VM for the Attendance card. The alternative was five client calls — schedule,
 * presence, movements, history, corrections — which would have shown the card assembling itself on
 * screen and paid the cost again on every participant switch.
 *
 * The org comes from the authenticated session, never the query, so a member id from another tenant
 * resolves to nothing rather than to that tenant's attendance.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const customerMemberId = searchParams.get("customer_member_id")?.trim() ?? "";
    if (!customerMemberId) {
        return NextResponse.json({ error: "customer_member_id is required" }, { status: 400 });
    }

    try {
        const vm = await buildAttendanceCardVM(createAdminClient(), {
            orgId: ctx.orgId,
            customerMemberId,
            displayName: searchParams.get("display_name")?.trim() || null,
            date: searchParams.get("date")?.trim() || null,
            // The Details experience asks for a wider window than the summary's five days.
            // Bounded here so a caller cannot ask for an unbounded history.
            recentDays: Math.min(
                Math.max(Number(searchParams.get("recent_days") ?? 5) || 5, 1),
                120,
            ),
        });
        return NextResponse.json({ ok: true, vm });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}

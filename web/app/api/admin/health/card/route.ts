import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { buildHealthSafetyCardVM } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/health/card?customer_member_id=…
 *
 * ONE composed VM for the Health & Safety card, summary and detail.
 *
 * ── D-H6 IS ENFORCED HERE AND BELOW ──
 *
 * The caller's real grants are resolved and handed to the read model, which refuses without
 * `health.view`. Route admission (`requireAdminOrOps`) is deliberately NOT the boundary: an operator
 * who works Attendance holds that admission and must not receive allergies, conditions and
 * medications from this endpoint. The refusal is a 403 carrying `permission_denied`, so the card can
 * say "you do not have permission" rather than render an empty surface that reads as "no allergies".
 *
 * The org comes from the session, never the query, so a member id from another tenant resolves to
 * nothing rather than to that tenant's health record.
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

    const access = await getAdminAccessContextCached();
    /*
     * A failed access resolution DENIES. `permissionKeys` is null when the grant read failed, which
     * is not the same answer as "holds no grants" — collapsing the two makes the failure OPEN.
     */
    const permissionKeys = access.ok ? access.permissionKeys : null;

    try {
        const vm = await buildHealthSafetyCardVM(createAdminClient(), {
            orgId: ctx.orgId,
            customerMemberId,
            displayName: searchParams.get("display_name")?.trim() || null,
            access: { permissionKeys },
        });
        if (vm.permissionDenied) {
            return NextResponse.json(
                { ok: false, permission_denied: true, error: vm.unavailableReason },
                { status: 403 },
            );
        }
        return NextResponse.json({ ok: true, vm });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}

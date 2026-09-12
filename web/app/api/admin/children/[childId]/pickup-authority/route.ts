/**
 * Who may collect this child today, and why.
 *
 * Read-only. It derives from `resolvePickupAuthorization` — the same seam the
 * kiosk decides with — so an administrator checking this screen and a front desk
 * refusing a collection cannot disagree.
 *
 * `on_date` is accepted because pickup is a question about a DAY: a restriction
 * that lapses tomorrow must not silently rewrite today's explanation.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { loadChildPickupAuthority } from "@/lib/safeguarding/childPickupAdministration";
import { assertAttendanceReadAllowed } from "@/lib/childcareOperational/attendance/attendancePermissions";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest, context: { params: Promise<{ childId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { childId } = await context.params;
    const id = typeof childId === "string" ? childId.trim() : "";
    if (!id) return NextResponse.json({ error: "childId required" }, { status: 400 });

    // Gated on the named attendance read capability rather than on "is an admin".
    // This answer is derived from safeguarding state, and an admin session is not
    // by itself a reason to see who may collect a particular child.
    const supabase = createAdminClient();
    const verdict = await assertAttendanceReadAllowed({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
    });
    if (!verdict.ok) {
        return NextResponse.json({ error: verdict.message ?? "Forbidden" }, { status: 403 });
    }

    const raw = (new URL(request.url).searchParams.get("on_date") ?? "").trim();
    if (raw && !ISO_DATE_RE.test(raw)) {
        return NextResponse.json({ error: "on_date must be YYYY-MM-DD" }, { status: 400 });
    }
    const onDate = raw || new Date().toISOString().slice(0, 10);

    try {
        const result = await loadChildPickupAuthority(supabase, ctx.orgId, id, onDate);
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Failed to resolve pickup authority" },
            { status: 500 },
        );
    }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";

/** GET /api/admin/tours/slots?location_id=&from=&to=&user_id= */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const locationId = (searchParams.get("location_id") ?? "").trim();
    const userId = (searchParams.get("user_id") ?? "").trim() || null;
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    if (!locationId || !fromRaw || !toRaw) {
        return NextResponse.json({ error: "location_id, from, and to are required (ISO timestamps)" }, { status: 400 });
    }
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || !(to > from)) {
        return NextResponse.json({ error: "Invalid from/to range" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const slots = await computeAvailableTourSlots(supabase, {
        orgId: ctx.orgId,
        locationId,
        userId,
        from,
        to,
    });
    return NextResponse.json({ slots });
}

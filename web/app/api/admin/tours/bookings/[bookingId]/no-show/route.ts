import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { markTourBookingNoShow } from "@/lib/tours/bookings/tourBookingService";

/** POST /api/admin/tours/bookings/[bookingId]/no-show */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { bookingId } = await params;
    const id = String(bookingId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

    const supabase = createAdminClient();
    try {
        const row = await markTourBookingNoShow(supabase, ctx.orgId, id);
        return NextResponse.json({ booking: row });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}

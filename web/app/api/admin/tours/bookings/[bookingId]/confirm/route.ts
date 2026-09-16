import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { confirmTourBooking } from "@/lib/tours/bookings/tourBookingService";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { TOURS_BOOK, requireToursCapability } from "@/lib/access/toursAuthority";

/** POST /api/admin/tours/bookings/[bookingId]/confirm */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
    /*
     * TOURS BOOKING — confirms one family's tour.
     *
     * `requireAdminOrOps()` stood here, and despite its name it resolves PORTAL
     * ADMISSION and no role: every principal who could enter the portal could do this.
     * `tours.book` is the authority now, held by grant and by nothing else.
     */
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requireToursCapability(access, TOURS_BOOK);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { bookingId } = await params;
    const id = String(bookingId ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

    const supabase = createAdminClient();
    try {
        const row = await confirmTourBooking(supabase, ctx.orgId, id, { actorUserId: ctx.userId });
        return NextResponse.json({ booking: row });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}

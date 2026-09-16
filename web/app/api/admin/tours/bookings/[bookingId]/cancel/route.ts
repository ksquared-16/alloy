import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { cancelTourBooking } from "@/lib/tours/bookings/tourBookingService";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { TOURS_BOOK, requireToursCapability } from "@/lib/access/toursAuthority";

type Body = { canceled_by?: string; cancel_reason?: string | null };

/** POST /api/admin/tours/bookings/[bookingId]/cancel */
export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
    /*
     * TOURS BOOKING — cancels one family's tour.
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

    let body: Body = {};
    try {
        if (request.headers.get("content-type")?.includes("application/json")) {
            body = (await request.json()) as Body;
        }
    } catch {
        /* empty body ok */
    }
    const canceledBy = String(body.canceled_by ?? "admin").trim() || "admin";

    const supabase = createAdminClient();
    try {
        const row = await cancelTourBooking(supabase, ctx.orgId, id, {
            canceledBy,
            cancelReason: body.cancel_reason ?? null,
        });
        return NextResponse.json({ booking: row });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}

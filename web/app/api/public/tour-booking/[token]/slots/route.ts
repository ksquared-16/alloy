import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import { decodePublicTourToken, resolveTourPublicBookingLinkByToken } from "@/lib/tours/public/resolveTourPublicBookingLink";
import { assertTourPublicSlotsQueryWindow } from "@/lib/tours/public/tourPublicSlotsWindow";
import { takeTourPublicRateLimit } from "@/lib/tours/public/tourPublicRateLimit";
import { tourPublicErr, tourPublicJson, tourPublicRateLimited } from "@/lib/tours/public/tourPublicHttp";

/** GET /api/public/tour-booking/[token]/slots?from=&to= */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return tourPublicErr("Server misconfiguration", 500);
    }
    const { token: raw } = await params;
    const token = decodePublicTourToken(raw ?? "");
    const retry = takeTourPublicRateLimit(request, "slots", token);
    if (retry != null) {
        return tourPublicRateLimited(retry);
    }

    const supabase = createServiceRoleClient();
    const resolved = await resolveTourPublicBookingLinkByToken(supabase, token);
    if (!resolved.ok) {
        const codeMap = { NOT_FOUND: 404, INACTIVE: 403, EXPIRED: 403 };
        return tourPublicErr(resolved.error.message, codeMap[resolved.error.code] ?? 400, { code: resolved.error.code });
    }
    const row = resolved.row;
    const { searchParams } = new URL(request.url);
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    if (!fromRaw || !toRaw) {
        return tourPublicErr("from and to ISO timestamps required", 400);
    }
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    const win = assertTourPublicSlotsQueryWindow(from, to);
    if (!win.ok) {
        return tourPublicErr(win.message, 400);
    }

    const slots = await computeAvailableTourSlots(supabase, {
        orgId: row.org_id,
        locationId: row.location_id,
        userId: null,
        from: win.from,
        to: win.to,
    });
    return tourPublicJson({ ok: true, slots });
}

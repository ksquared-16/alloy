import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { requestEmbedOrigin } from "@/lib/public/forms/embedOrigin";
import { assertTourPublicSlotsQueryWindow } from "@/lib/tours/public/tourPublicSlotsWindow";
import { tourPublicErr, tourPublicJson, tourPublicRateLimited } from "@/lib/tours/public/tourPublicHttp";
import { takeTourPublicRateLimit } from "@/lib/tours/public/tourPublicRateLimit";
import {
    listPublicTourSlots,
    PUBLIC_TOUR_CALENDAR_FAILURE_STATUS,
    PUBLIC_TOUR_CALENDAR_UNAVAILABLE_MESSAGE,
    resolvePublicTourCalendar,
} from "@/lib/tours/publicCalendar/publicTourCalendarServer";

export const dynamic = "force-dynamic";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/**
 * GET /api/public/tours/[token]/slots?from=&to=
 *
 * A school's public tour calendar (S7): available times for the location the TOKEN is
 * published for. The organization and location come from the link, never from the query,
 * so a caller cannot point this at another site or tenant. The window is capped (45 days)
 * and rate-limited per client and token.
 *
 * The response is a list of intervals and their timezone — nothing about capacity, rules,
 * other bookings or any family. Reading availability holds nothing and books nothing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return tourPublicErr("Server misconfiguration", 500);
    const { token: raw } = await params;
    const token = plaintextToken(raw ?? "");

    const retryAfter = takeTourPublicRateLimit(request, "calendar_slots", token);
    if (retryAfter != null) return tourPublicRateLimited(retryAfter);

    const { searchParams } = new URL(request.url);
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    if (!fromRaw || !toRaw) return tourPublicErr("from and to ISO timestamps required", 400);
    const win = assertTourPublicSlotsQueryWindow(new Date(fromRaw), new Date(toRaw));
    if (!win.ok) return tourPublicErr(win.message, 400);

    const supabase = createServiceRoleClient();
    const cal = await resolvePublicTourCalendar(supabase, token, { embedOrigin: requestEmbedOrigin(request) });
    if (!cal.ok) {
        return tourPublicErr(PUBLIC_TOUR_CALENDAR_UNAVAILABLE_MESSAGE, PUBLIC_TOUR_CALENDAR_FAILURE_STATUS[cal.code], {
            code: cal.code === "ORIGIN_FORBIDDEN" ? "ORIGIN_FORBIDDEN" : "UNAVAILABLE",
        });
    }

    try {
        const slots = await listPublicTourSlots(supabase, cal.value, { from: win.from, to: win.to });
        return tourPublicJson({ ok: true, timezone: cal.value.timezone, checked_at: new Date().toISOString(), slots });
    } catch {
        // A calendar or schedule read failure never offers times it could not check.
        return tourPublicErr("We couldn't load available times just now. Please try again.", 503, { code: "UNAVAILABLE" });
    }
}

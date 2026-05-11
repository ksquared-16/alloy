import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { createTourBooking } from "@/lib/tours/bookings/tourBookingService";
import type { CreateTourBookingInput } from "@/lib/tours/bookings/types";
import { decodePublicTourToken, resolveTourPublicBookingLinkByToken } from "@/lib/tours/public/resolveTourPublicBookingLink";
import { takeTourPublicRateLimit } from "@/lib/tours/public/tourPublicRateLimit";
import { tourPublicErr, tourPublicJson, tourPublicRateLimited } from "@/lib/tours/public/tourPublicHttp";
import { assertBookingLocationMatchesOpportunity, fetchOpportunityForTourAdmin } from "@/lib/tours/admin/opportunityTourContext";

type Body = {
    rule_id?: string;
    start_at?: string;
    end_at?: string;
    timezone?: string;
};

/** POST /api/public/tour-booking/[token]/book */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return tourPublicErr("Server misconfiguration", 500);
    }
    const { token: raw } = await params;
    const token = decodePublicTourToken(raw ?? "");
    const retry = takeTourPublicRateLimit(request, "book", token);
    if (retry != null) {
        return tourPublicRateLimited(retry);
    }

    const supabase = createServiceRoleClient();
    const resolved = await resolveTourPublicBookingLinkByToken(supabase, token);
    if (!resolved.ok) {
        const codeMap = { NOT_FOUND: 404, INACTIVE: 403, EXPIRED: 403 };
        return tourPublicErr(resolved.error.message, codeMap[resolved.error.code] ?? 400, { code: resolved.error.code });
    }
    const link = resolved.row;

    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return tourPublicErr("Invalid JSON", 400);
    }
    const ruleId = String(body.rule_id ?? "").trim();
    const startAt = body.start_at != null ? new Date(String(body.start_at)) : null;
    const endAt = body.end_at != null ? new Date(String(body.end_at)) : null;
    const timezone = String(body.timezone ?? "").trim();
    if (!ruleId || !startAt || !endAt || !timezone || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        return tourPublicErr("rule_id, start_at, end_at, timezone required", 400);
    }

    const oppRes = await fetchOpportunityForTourAdmin(supabase, link.org_id, link.opportunity_id);
    if (!oppRes.ok) {
        return tourPublicErr("Invalid or unknown link", oppRes.status === 404 ? 404 : 400);
    }

    const locCheck = assertBookingLocationMatchesOpportunity(oppRes.row, link.location_id);
    if (!locCheck.ok) {
        return tourPublicErr("Invalid or unknown link", 400);
    }

    const { data: rule, error: rErr } = await supabase
        .from("tour_availability_rules")
        .select("id, org_id, location_id, approval_required, is_active")
        .eq("id", ruleId)
        .eq("org_id", link.org_id)
        .maybeSingle();
    if (rErr || !rule) return tourPublicErr("Rule not found", 400);
    const ru = rule as { location_id?: string | null; approval_required?: boolean; is_active?: boolean };
    if (ru.is_active === false) return tourPublicErr("Rule inactive", 400);
    if (ru.location_id != null && String(ru.location_id).trim() !== "" && String(ru.location_id).trim() !== link.location_id) {
        return tourPublicErr("Slot rule does not match link location", 400);
    }

    const input: CreateTourBookingInput = {
        orgId: link.org_id,
        opportunityId: link.opportunity_id,
        locationId: link.location_id,
        startAt,
        endAt,
        timezone,
        source: "public_link",
        requestedByUserId: null,
        primaryPersonId: oppRes.row.primary_person_id,
        primaryContactId: oppRes.row.primary_contact_id,
        approvalRequired: Boolean(ru.approval_required),
        metadata: { tour_public_booking_link_id: link.id, rule_id: ruleId },
    };

    try {
        const booking = await createTourBooking(supabase, input);
        return tourPublicJson(
            {
                ok: true,
                booking: {
                    id: booking.id,
                    status_key: booking.status_key,
                    start_at: booking.start_at,
                    end_at: booking.end_at,
                    timezone: booking.timezone,
                },
            },
            { status: 201 }
        );
    } catch (e) {
        console.warn("[public tour-booking] createTourBooking failed", e instanceof Error ? e.message : e);
        return tourPublicErr("Booking could not be completed. Please try again or contact the site.", 400, { code: "BOOKING_FAILED" });
    }
}

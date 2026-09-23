/**
 * The time-aware Staffing Projection — read-only, batch over a site and a date range.
 *
 * A projection with no way to ask it is a library, and Operations cannot run a
 * library. This is the one read surface; it authors nothing, and it is not a
 * Calendar — there is no editing here and no place to put any.
 *
 * It also returns the whole-day PARITY for each day: the segmented answer reduced
 * to the whole-day shape, compared against the existing supply reading, on the
 * deployed build's own data. That makes convergence something the running system
 * demonstrates rather than something a fixture asserts, and it means the day the
 * two readings start to disagree, the disagreement is visible here first.
 */

import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    operationalEnrollmentErrorResponse,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";
import { buildStaffSupply } from "@/lib/scheduling/supply/buildStaffSupply";
import { fetchStaffingProjection } from "@/lib/staffingProjection/fetchStaffingProjection";
import {
    compareWholeDaySupply,
    wholeDayFromProjection,
} from "@/lib/staffingProjection/wholeDayConvergence";
import { createAdminClient } from "@/lib/supabaseAdmin";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** A month is already more than an operator reads at once, and it bounds the work. */
const MAX_DAYS = 31;

function daysBetween(start: string, end: string): number {
    return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const siteLocationId = (searchParams.get("site_location_id") ?? "").trim();
    if (!siteLocationId) {
        return NextResponse.json(
            { error: "site_location_id is required", code: "invalid_input" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    try {
        const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const requestedStart = (searchParams.get("date") ?? searchParams.get("date_start") ?? "").trim();
        const dateStart = ISO_DATE_RE.test(requestedStart) ? requestedStart : todayYmd;
        const requestedEnd = (searchParams.get("date_end") ?? "").trim();
        const dateEnd = ISO_DATE_RE.test(requestedEnd) ? requestedEnd : dateStart;

        if (dateEnd < dateStart) {
            return NextResponse.json(
                { error: "date_end must not precede date_start", code: "invalid_input" },
                { status: 400 }
            );
        }
        if (daysBetween(dateStart, dateEnd) > MAX_DAYS) {
            return NextResponse.json(
                { error: `at most ${MAX_DAYS} days may be projected at once`, code: "invalid_input" },
                { status: 400 }
            );
        }

        // An unclosed check-in runs to this moment, not to the end of the day.
        const asOf = (searchParams.get("as_of") ?? "").trim();
        const openObservationsEndAt = HHMM_RE.test(asOf) ? asOf : null;

        const projection = await fetchStaffingProjection(supabase, {
            orgId: ctx.orgId,
            siteLocationId,
            dateStart,
            dateEnd,
            openObservationsEndAt,
        });

        const supply = await buildStaffSupply(supabase, {
            orgId: ctx.orgId,
            siteLocationId,
            dateStart,
            dateEnd,
        });
        const parity = projection.days.map((day) =>
            compareWholeDaySupply(supply.cells, wholeDayFromProjection(day), day.date)
        );

        return NextResponse.json({ projection, parity, todayYmd });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}

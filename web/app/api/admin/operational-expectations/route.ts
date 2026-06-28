import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { fetchScheduleExpectations } from "@/lib/childcareOperational/expectations/fetchScheduleExpectations";
import {
    operationalEnrollmentErrorResponse,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 92;

function addDaysYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

/**
 * Read-only Schedule-derived Expectations (L3). Derived, non-authoritative —
 * no persistence. Returns expected attendance / occupancy / staffing + warnings
 * for a site over a date range (defaults to a 14-day window from org-local today).
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    const { searchParams } = new URL(request.url);
    const siteLocationId = (searchParams.get("site_location_id") ?? "").trim();
    if (!siteLocationId) {
        return NextResponse.json(
            { error: "site_location_id is required", code: "invalid_input" },
            { status: 400 }
        );
    }

    let dateStart = (searchParams.get("date_start") ?? "").trim();
    let dateEnd = (searchParams.get("date_end") ?? "").trim();

    const supabase = createAdminClient();
    try {
        if (!dateStart) {
            dateStart = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        }
        if (!dateEnd) {
            dateEnd = addDaysYmd(dateStart, 13);
        }
        if (!ISO_DATE_RE.test(dateStart) || !ISO_DATE_RE.test(dateEnd)) {
            return NextResponse.json(
                { error: "date_start and date_end must be YYYY-MM-DD", code: "invalid_input" },
                { status: 400 }
            );
        }
        if (dateEnd < dateStart) {
            return NextResponse.json(
                { error: "date_end must be on or after date_start", code: "invalid_input" },
                { status: 400 }
            );
        }
        if (addDaysYmd(dateStart, MAX_RANGE_DAYS) < dateEnd) {
            return NextResponse.json(
                { error: `date range may not exceed ${MAX_RANGE_DAYS} days`, code: "invalid_input" },
                { status: 400 }
            );
        }

        const expectations = await fetchScheduleExpectations(supabase, {
            orgId: ctx.orgId,
            siteLocationId,
            dateStart,
            dateEnd,
        });
        return NextResponse.json({ expectations, range: { dateStart, dateEnd, siteLocationId } });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}

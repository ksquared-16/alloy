import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { recurringPatternOn } from "@/lib/staffAvailability/staffAvailabilityModel";
import { resolveAvailabilityForEmployment } from "@/lib/staffAvailability/staffAvailabilityService";

/**
 * Staff availability for one employment: the recurring pattern in force, the
 * exceptions on the books, and the resolved answer for a requested day.
 *
 * READ ONLY. Every mutation goes through the registered commands, so this route
 * cannot become a second write path.
 *
 * The day is the ORGANISATION's calendar day, resolved server-side through the
 * existing timezone contract. Availability is local wall-clock intent, so a caller
 * in another timezone must not get a different answer about which day it is.
 *
 * It deliberately reads NO scheduled shifts. Schedule may consume availability
 * later; availability derived from schedule would make the schedule its own
 * justification.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const params = new URL(request.url).searchParams;
    const employmentId = (params.get("employment_id") ?? "").trim();
    if (!employmentId) {
        return NextResponse.json({ error: "employment_id is required", code: "invalid_input" }, { status: 400 });
    }

    const supabase = createAdminClient();
    try {
        // `as_of` is accepted so a caller can ask about another day — the card uses it
        // to explain an upcoming exception — but it defaults to the org's today.
        const asOf = (params.get("as_of") ?? "").trim()
            || (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));

        // The employment must be this organization's. Asked before anything is read,
        // so a foreign id is `not_found` rather than an empty-looking success.
        const { data: emp } = await supabase
            .from("employments")
            .select("id")
            .eq("id", employmentId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (!emp) {
            return NextResponse.json({ error: "Employment not found", code: "not_found" }, { status: 404 });
        }

        const resolved = await resolveAvailabilityForEmployment(supabase, ctx.orgId, employmentId, asOf);
        const { windows_all, exceptions_all, ...answer } = resolved;

        // The pattern grouped by weekday is what the card renders; grouping here keeps
        // one answer rather than letting the card regroup and drift.
        const pattern = recurringPatternOn(windows_all, asOf);
        const recurring = [...pattern.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([weekday, rows]) => ({
                weekday,
                windows: rows.map((r) => ({
                    id: r.id,
                    start_time: r.start_time,
                    end_time: r.end_time,
                    effective_start: r.effective_start,
                    effective_end: r.effective_end,
                })),
            }));

        return NextResponse.json({
            as_of: asOf,
            resolved: answer,
            recurring,
            // Active exceptions from the resolved day forward — what an operator needs
            // to see. History stays available through `exceptions_all`.
            upcoming_exceptions: exceptions_all
                .filter((e) => e.is_active && e.exception_date >= asOf)
                .sort((a, b) => a.exception_date.localeCompare(b.exception_date)),
            exceptions_all,
            // Inactive rows are carried separately rather than hidden: a cancelled
            // exception explains why a past schedule looked as it did.
            has_inactive_exceptions: exceptions_all.some((e) => !e.is_active),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to resolve availability";
        return NextResponse.json({ error: message, code: "internal_error" }, { status: 500 });
    }
}

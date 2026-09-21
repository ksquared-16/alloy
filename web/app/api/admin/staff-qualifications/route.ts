import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import {
    listQualificationTypes,
    resolveQualificationStateForWorkContext,
} from "@/lib/staffQualifications/staffQualificationService";

/**
 * Staff qualification state for one employment: what is held, what is required,
 * and which requirement each held qualification satisfies.
 *
 * READ ONLY. Every mutation goes through the registered commands, so this route
 * cannot become a second write path.
 *
 * The day is the ORGANISATION's calendar day, resolved server-side. Expiration is
 * derived against it, so "expired" is the same answer for every caller rather
 * than depending on the reader's timezone — the failure Slice 1 hit when a UTC
 * date met an org-day resolver.
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
        const asOf = (params.get("as_of") ?? "").trim() || (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
        // Work context: the employment's own position and primary site, plus any
        // assignment types it is currently assigned under. Requirement axes are
        // read from canonical authority rather than supplied by the caller.
        const { data: emp } = await supabase
            .from("employments")
            .select("id, person_id, position_id, primary_location_id")
            .eq("id", employmentId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (!emp) {
            return NextResponse.json({ error: "Employment not found", code: "not_found" }, { status: 404 });
        }
        const employment = emp as {
            id: string;
            person_id: string;
            position_id: string | null;
            primary_location_id: string | null;
        };

        /*
         * The assignment axis is the assignments THIS PERSON holds on the resolved day.
         *
         * Staff assignments are keyed by `subject_person_id`, not by employment — the
         * `schedule_assignments_subject_shape_check` constraint is explicit that a staff row
         * carries a person and a site and no agreement. Reading them by person and then
         * bounding them by the day is what makes the axis mean "assignments in force now":
         * an ended assignment must not keep a requirement alive, and a future one must not
         * impose it early.
         */
        const { data: assignments } = await supabase
            .from("schedule_assignments")
            .select("operational_assignment_type_id, start_date, end_date, status")
            .eq("org_id", ctx.orgId)
            .eq("subject_type", "staff")
            .eq("subject_person_id", employment.person_id)
            .in("status", ["planned", "active", "ending"])
            .lte("start_date", asOf);

        const assignmentTypeIds = [
            ...new Set(
                ((assignments ?? []) as {
                    operational_assignment_type_id: string | null;
                    end_date: string | null;
                }[])
                    // `end_date` is nullable and open-ended, so the bound is applied here
                    // rather than as an `.or()` filter that would read as two conditions.
                    .filter((a) => a.end_date == null || a.end_date >= asOf)
                    .map((a) => a.operational_assignment_type_id)
                    .filter((v): v is string => Boolean(v)),
            ),
        ];

        const state = await resolveQualificationStateForWorkContext(supabase, ctx.orgId, {
            employmentId,
            positionId: employment.position_id,
            siteLocationId: employment.primary_location_id,
            assignmentTypeIds,
            asOf,
        });
        /*
         * The types come back with the state because a qualification id is not a label, and the
         * only other route that publishes them requires `configuration.vocabulary.manage` — the
         * capability to CHANGE the vocabulary. An operator who may read a staff record but may not
         * configure the org would otherwise see a list of UUIDs. Reading a vocabulary and editing
         * it are different permissions, and this route only ever reads.
         */
        const types = await listQualificationTypes(supabase, ctx.orgId);
        return NextResponse.json({ as_of: asOf, types, ...state });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to resolve qualification state";
        return NextResponse.json({ error: message, code: "internal_error" }, { status: 500 });
    }
}

import "server-only";

/**
 * THE DURABLE STAFF MEMBER'S SCHEDULE CONTEXT — the same composition, one subject over.
 *
 * `Operations → Roster → Staff → Jane → Schedule` renders the platform's canonical `scheduling`
 * card. Not a staff copy of it: the SAME card, reading the SAME `_scheduling_projection` bag, firing
 * the SAME registered assignment actions. This module composes that bag for a staff subject, exactly
 * as `composeDurableChildScheduling` does for a child, and returns the identical wire shape so the
 * card cannot tell which subject composed it.
 *
 * ── WHAT DIFFERS, AND WHY IT IS NOT A FORK ──
 *
 * Three reads change, and each one changes because the canonical write layer already draws the same
 * line:
 *
 *     assignment rows    by `subject_person_id` + `subject_type='staff'`, not by member
 *     assignment types   `subjectType: "staff"` — `operational_assignment_types.subject_types`
 *                        already declares which purposes admit which subject
 *     the bag's key      the PERSON id, because that is a staff subject's identity of record
 *
 * Everything else — site config, patterns, rooms, effective dating, bucketing — is the same call to
 * the same function. A staff schedule that bucketed "current" differently from a child's would mean
 * the operating day was assembled from two disagreeing definitions.
 *
 * ── THE SITE COMES FROM THE COMMITMENT ──
 *
 * Same rule as the child path, and for a stronger reason: a staff member has no case and no
 * agreement, so `schedule_assignments.site_location_id` is the ONLY canonical statement of where
 * they are scheduled. That is the row `buildSubjectScheduleContext` builds the Schedule context
 * from, so the card and the context chip cannot disagree about which site they mean.
 *
 * A staff member with no schedule row therefore has no Schedule context, and this is never called
 * for them — `null` means "no commitment", which is a different sentence from "no data".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { loadSchedulingProjectionForStaff } from "@/lib/scheduling/projection/buildSchedulingProjection";
import { loadEditorPatternsForSite } from "@/lib/scheduling/editorPatterns";
import { loadOrgAssignmentTypes } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";
import { loadSiteOperationalRooms } from "@/lib/operationalAssignments/loadSiteOperationalRooms";
import {
    resolveSiteConfig,
    type SchedulingProjectionFirstPaint,
} from "@/lib/adminV2/viewModel/drawer/opportunity/loadSchedulingProjectionsForFirstPaint";

export type ComposeDurableStaffSchedulingInput = {
    supabase: SupabaseClient;
    orgId: string;
    /** `persons.id` — the staff member's identity of record. */
    personId: string;
    /** Operator-facing name, for the projection's subject label. */
    subjectName: string;
    /** The site this staff member is scheduled at, from their own schedule row. */
    siteLocationId: string;
};

export async function composeDurableStaffScheduling(
    input: ComposeDurableStaffSchedulingInput,
): Promise<SchedulingProjectionFirstPaint | null> {
    const { supabase, orgId } = input;
    const personId = input.personId.trim();
    const siteLocationId = input.siteLocationId.trim();
    if (!personId || !siteLocationId) return null;

    const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, orgId);
    const computedAt = `${todayYmd}T00:00:00.000Z`;

    // Each read degrades to empty on its own rather than costing the operator the whole card, as on
    // the child path: a site with no configured patterns is a real state, not a broken card.
    const [{ siteName, operatingDays, scheduleTypes }, patterns, assignmentTypes, operationalRooms] =
        await Promise.all([
            resolveSiteConfig(supabase, orgId, siteLocationId).catch(() => ({
                siteName: null,
                operatingDays: [] as number[],
                scheduleTypes: [] as SchedulingProjectionFirstPaint["scheduleTypes"],
            })),
            loadEditorPatternsForSite(supabase, orgId, siteLocationId).catch(() => []),
            // The TYPES OWNER decides which purposes admit a staff subject. Passing "staff" here is
            // not a filter this module invents — it reads `subject_types`, which the assignment-type
            // configuration already carries, so Studio remains the single authority over the list.
            loadOrgAssignmentTypes(supabase, orgId, { subjectType: "staff" }).catch(() => []),
            loadSiteOperationalRooms(supabase, orgId, siteLocationId).catch(() => []),
        ]);

    const projection = await loadSchedulingProjectionForStaff(supabase, orgId, {
        personId,
        siteLocationId,
        todayYmd,
        computedAt,
        subjectName: input.subjectName,
        siteName,
    }).catch(() => null);

    const staff = projection?.children?.[0] ?? null;

    return {
        // Keyed by PERSON id. The bag's field is named `byMemberId` because a child was its first
        // subject; the card looks the active subject up by whatever id that subject is identified
        // by, so one map serves both without a second bag or a second lookup path.
        byMemberId: staff ? { [personId]: staff } : {},
        asOf: todayYmd,
        operatingDays,
        scheduleTypes,
        patterns,
        assignmentTypes,
        operationalRooms,
    };
}

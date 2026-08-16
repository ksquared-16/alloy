import "server-only";

/**
 * THE DURABLE CHILD'S SCHEDULE CONTEXT — canonical assignment truth, composed without a case.
 *
 * `Operations → Roster → Lennon → Schedule` renders the platform's canonical `scheduling` card. That
 * card already exists, already invokes all six canonical assignment capabilities, and already reads
 * its facts from `context.truth._scheduling_projection`. So the only thing missing on a durable host
 * was the bag — and this module composes it.
 *
 * ── IT COMPOSES NOTHING OF ITS OWN ──
 *
 * Every fact comes from the same functions the opportunity first-paint path calls:
 *
 *     loadSchedulingProjectionForChild   the child's committed + proposed assignments
 *     resolveSiteConfig                  operating days + schedule types (exported for this)
 *     loadEditorPatternsForSite          the site's schedule patterns
 *     loadOrgAssignmentTypes             org assignment types
 *     loadSiteOperationalRooms           rooms the pickers offer
 *
 * The shape returned is `SchedulingProjectionFirstPaint`, unchanged, so the card cannot tell which
 * host composed it. **There is no second assignment store and no second projection.** If this file
 * ever starts deriving an assignment fact rather than reading one, that is the duplication the
 * convergence audit's stop condition names.
 *
 * ── THE SITE COMES FROM THE COMMITMENT, NOT FROM A CASE ──
 *
 * The opportunity path reads `record.location_id` — a case field. A durable child has no case, and
 * the honest substitute is not "the org's first site": it is the site the child is actually
 * scheduled at, which `schedule_assignments.site_location_id` already states. That is the same row
 * `buildSubjectScheduleContext` builds the Schedule context FROM, so the card and the context chip
 * cannot disagree about which site they mean.
 *
 * A child with no schedule row therefore has no Schedule context at all, and this is never called
 * for them — `null` here means "no commitment", which is a different sentence from "no data".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { loadSchedulingProjectionForChild } from "@/lib/scheduling/projection/buildSchedulingProjection";
import { loadEditorPatternsForSite } from "@/lib/scheduling/editorPatterns";
import { loadOrgAssignmentTypes } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";
import { loadSiteOperationalRooms } from "@/lib/operationalAssignments/loadSiteOperationalRooms";
import {
    resolveSiteConfig,
    type SchedulingProjectionFirstPaint,
} from "@/lib/adminV2/viewModel/drawer/opportunity/loadSchedulingProjectionsForFirstPaint";

export type ComposeDurableChildSchedulingInput = {
    supabase: SupabaseClient;
    orgId: string;
    /** `customer_members.id` — the child's identity of record. */
    memberId: string;
    /** Operator-facing name, for the projection's subject label. */
    subjectName: string;
    /** The site the child is scheduled at, from their own schedule row. */
    siteLocationId: string;
};

/**
 * Compose the Schedule context's facts for one durable child.
 *
 * Returns null when there is no site to compose against — the caller renders the context as having
 * no commitment rather than as having failed.
 */
export async function composeDurableChildScheduling(
    input: ComposeDurableChildSchedulingInput,
): Promise<SchedulingProjectionFirstPaint | null> {
    const { supabase, orgId } = input;
    const memberId = input.memberId.trim();
    const siteLocationId = input.siteLocationId.trim();
    if (!memberId || !siteLocationId) return null;

    const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, orgId);
    const computedAt = `${todayYmd}T00:00:00.000Z`;

    // Same four site-scoped reads the opportunity path issues, in one round of parallelism. Each
    // degrades to empty on its own rather than costing the operator the whole card: a site with no
    // configured patterns is a real state, and it must not read as "scheduling is broken".
    const [{ siteName, operatingDays, scheduleTypes }, patterns, assignmentTypes, operationalRooms] =
        await Promise.all([
            resolveSiteConfig(supabase, orgId, siteLocationId).catch(() => ({
                siteName: null,
                operatingDays: [] as number[],
                scheduleTypes: [] as SchedulingProjectionFirstPaint["scheduleTypes"],
            })),
            loadEditorPatternsForSite(supabase, orgId, siteLocationId).catch(() => []),
            loadOrgAssignmentTypes(supabase, orgId, { subjectType: "child" }).catch(() => []),
            loadSiteOperationalRooms(supabase, orgId, siteLocationId).catch(() => []),
        ]);

    const projection = await loadSchedulingProjectionForChild(supabase, orgId, {
        customerMemberId: memberId,
        siteLocationId,
        todayYmd,
        computedAt,
        subjectName: input.subjectName,
        siteName,
    }).catch(() => null);

    const child = projection?.children?.[0] ?? null;

    return {
        // Keyed by member id exactly as the card expects, with the ONE child this host is about.
        // An empty map is legitimate: a child whose commitments were all archived still has a
        // Schedule context, and the card says "no assignments" rather than rendering nothing.
        byMemberId: child ? { [memberId]: child } : {},
        asOf: todayYmd,
        operatingDays,
        scheduleTypes,
        patterns,
        assignmentTypes,
        operationalRooms,
    };
}

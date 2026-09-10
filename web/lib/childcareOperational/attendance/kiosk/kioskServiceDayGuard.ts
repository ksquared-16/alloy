/**
 * What the service day says about a child, read through Thread 4 rather than
 * re-decided here.
 *
 * The kiosk authors OBSERVATION. It does not own expectation architecture, so it
 * asks the same query seam and the same projection the roster asks, and acts on
 * the answer. Two consequences follow, and they point in opposite directions on
 * purpose:
 *
 *   KNOWN AWAY — a child on authored vacation who is brought in anyway may check
 *   in. The plan is not rewritten because reality differed: the expectation
 *   stays, the fact is authored, and Thread 4's projection derives
 *   `attended_despite_plan` on its own. There is no kiosk-specific
 *   reconciliation, and there must not be one.
 *
 *   CLOSED — a closed service day is refused. Not because closure is a stronger
 *   kind of absence, but because a closure is a statement that the site is not
 *   operating, and a tablet in an unstaffed lobby is the last thing that should
 *   decide it is operating after all. V1 has no trusted exceptional-authority
 *   mechanism, and inventing one here to make a scenario pass would be building
 *   the override before the authority that governs it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    ATTENDANCE_SUBJECT_KINDS,
    interpretServiceDay,
    serviceDayAsOf,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { effectiveExpectationsForWindow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { createSupabaseExpectationQueryGateway } from "@/lib/operationalExpectations/query/supabaseExpectationQueryGateway";

export type KioskServiceDayVerdict =
    | { operable: true; interpretation: string }
    | { operable: false; reason: "closed" | "unreadable" };

/**
 * May the kiosk author for this child today?
 *
 * A failed expectation read is `unreadable`, NOT operable. The query seam throws
 * rather than returning an empty set precisely so that "we could not ask" cannot
 * be mistaken for "nothing applies" — and a shared device must not check a child
 * into a site it could not confirm is open.
 */
export async function resolveKioskServiceDay(params: {
    supabase: SupabaseClient;
    orgId: string;
    siteLocationId: string;
    childId: string;
    roomLocationId: string | null;
    serviceDate: string;
}): Promise<KioskServiceDayVerdict> {
    const { supabase, orgId, siteLocationId, childId, roomLocationId, serviceDate } = params;

    const subjects = [
        { kind: ATTENDANCE_SUBJECT_KINDS.site, id: siteLocationId },
        { kind: ATTENDANCE_SUBJECT_KINDS.child, id: childId },
        ...(roomLocationId ? [{ kind: ATTENDANCE_SUBJECT_KINDS.operationalGroup, id: roomLocationId }] : []),
    ];

    let effective;
    try {
        effective = await effectiveExpectationsForWindow(
            { orgId, subjects, asOf: serviceDayAsOf(serviceDate) },
            createSupabaseExpectationQueryGateway(supabase),
        );
    } catch {
        return { operable: false, reason: "unreadable" };
    }

    const [row] = interpretServiceDay({
        siteLocationId,
        scheduledChildIds: [childId],
        groupByChildId: new Map([[childId, roomLocationId]]),
        effective: effective.effective,
        unresolved: effective.unresolved,
    });

    if (row?.interpretation === "closed") return { operable: false, reason: "closed" };
    // `known_away` and `unknown` both remain operable: the first is a plan reality
    // overtook, and the second is a lineage problem that must not strand a child
    // in a lobby. Neither is a statement that the site is shut.
    return { operable: true, interpretation: row?.interpretation ?? "normal" };
}

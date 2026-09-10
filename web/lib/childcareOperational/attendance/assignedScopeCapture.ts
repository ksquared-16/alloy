/**
 * Capture narrowed to the rooms a staff member is actually assigned to.
 *
 * `attendance.record` says WHAT you may do and site scope says WHERE, and for a
 * director that pair is the whole answer. For a classroom educator it is too
 * much reach: holding the capability at a site currently permits capturing for
 * any child at that site, including rooms the person has never worked in.
 *
 * ── WHAT SELECTS THIS POLICY, AND WHAT MUST NOT ──
 *
 * The narrowing is chosen by a capability the actor HOLDS —
 * `attendance.record.assigned_only` — never by anything about the subject. No
 * `is_employee`, no "an assignment exists therefore they are a teacher", no role
 * name. Those all make authority a consequence of a staffing record rather than
 * of a grant, so an operator editing a roster would silently change who may
 * write attendance, with no decision recorded anywhere.
 *
 * Because the narrowing is opt-in, its absence is exactly today's behaviour.
 * Directors and administrators are unaffected by construction rather than by a
 * carve-out somebody has to remember.
 *
 * ── THE ASSIGNMENT SOURCE IS BORROWED, NOT REBUILT ──
 *
 * Staff assignments live in `schedule_assignments` under the operational
 * assignment foundation, whose own comment records why children and staff share
 * it: so they "do not acquire competing scheduling engines". Attendance reads
 * that table and stores nothing of its own. Coverage needs no new concept
 * either — a supplemental assignment is simply another row whose window is open
 * today, so it widens reach while it lasts and stops mattering when it ends.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Assignment statuses that describe a commitment currently in force.
 *
 * MEASURED against the schema, not guessed. The CHECK constraint admits
 * `planned`, `active`, `ending`, `ended`, `superseded` and `canceled`, and the
 * only staff assignment in the certification fixture carries `planned` — a row
 * an operator has committed but whose window may not have opened yet. An earlier
 * draft of this list said `confirmed` and `scheduled`, which this schema has
 * never had, so it would have matched nothing and denied every teacher.
 *
 * The three in force are the ones that have not been withdrawn. `ended`,
 * `superseded` and `canceled` are excluded deliberately: whether the DATE window
 * still contains the service date is a separate question, asked below, and a
 * canceled assignment must not authorise anything even inside its old window.
 */
const LIVE_ASSIGNMENT_STATUSES = ["planned", "active", "ending"] as const;

export type AssignedScopeResolution = {
    /** Rooms the person may capture in. Empty means no applicable assignment. */
    roomLocationIds: readonly string[];
    /** Sites the person may capture in, from the same assignments. */
    siteLocationIds: readonly string[];
    /**
     * False when the lookup failed. Callers deny either way, but only this
     * separates "assigned to nothing today" from "we could not tell".
     */
    resolved: boolean;
};

const UNRESOLVED: AssignedScopeResolution = { roomLocationIds: [], siteLocationIds: [], resolved: false };

/**
 * The locations a person's CURRENT staff assignments cover on a service date.
 *
 * A row counts when it is a live staff commitment for this person whose window
 * contains the date. `end_date IS NULL` is an open-ended assignment, not an
 * expired one — treating null as closed would deny every permanent teacher.
 */
export async function resolveAssignedCaptureScope(params: {
    supabase: SupabaseClient;
    orgId: string;
    personId: string;
    serviceDate: string;
}): Promise<AssignedScopeResolution> {
    const org = (params.orgId ?? "").trim();
    const person = (params.personId ?? "").trim();
    const date = (params.serviceDate ?? "").trim();
    if (!org || !person || !date) return UNRESOLVED;

    const { data, error } = await params.supabase
        .from("schedule_assignments")
        .select("room_location_id, site_location_id, start_date, end_date, status")
        .eq("org_id", org)
        .eq("subject_type", "staff")
        .eq("subject_person_id", person)
        .in("status", LIVE_ASSIGNMENT_STATUSES as unknown as string[])
        .lte("start_date", date);

    if (error) return UNRESOLVED;

    const rooms = new Set<string>();
    const sites = new Set<string>();
    for (const row of (data ?? []) as unknown as Array<{
        room_location_id?: unknown;
        site_location_id?: unknown;
        end_date?: unknown;
    }>) {
        // Filtered here rather than in the query: an open-ended assignment has a
        // null end_date, and `or(end_date.is.null,end_date.gte.x)` is the shape
        // that has silently dropped open rows elsewhere in this codebase.
        const end = row.end_date != null ? String(row.end_date).trim() : "";
        if (end && end < date) continue;

        const room = row.room_location_id != null ? String(row.room_location_id).trim() : "";
        if (room) rooms.add(room);
        const site = row.site_location_id != null ? String(row.site_location_id).trim() : "";
        if (site) sites.add(site);
    }

    return { roomLocationIds: [...rooms], siteLocationIds: [...sites], resolved: true };
}

/**
 * Is every location this fact touches inside the person's assigned reach?
 *
 * Mirrors the site-scope check deliberately: the subject's site AND every
 * referenced room, because a fact that names only a site (an absence) and one
 * that names a room must both be contained.
 *
 * A capture naming NO location at all is refused rather than allowed. Under the
 * site-scoped policy an unnamed location is covered by the caller's site scope;
 * under this one there is nothing left to contain it, and "no location" would
 * otherwise become the way past the narrowing.
 */
export function assignedScopeCovers(params: {
    scope: AssignedScopeResolution;
    siteLocationId: string | null | undefined;
    roomLocationIds?: readonly (string | null | undefined)[];
}): { ok: true } | { ok: false; code: string; message: string } {
    const { scope } = params;
    if (!scope.resolved) {
        return {
            ok: false,
            code: "assignment_unresolved",
            message: "Your current room assignments could not be resolved.",
        };
    }
    if (scope.roomLocationIds.length === 0 && scope.siteLocationIds.length === 0) {
        return {
            ok: false,
            code: "no_applicable_assignment",
            message: "You have no current room assignment covering this capture.",
        };
    }

    const rooms = new Set(scope.roomLocationIds);
    const sites = new Set(scope.siteLocationIds);

    const named = (params.roomLocationIds ?? [])
        .map((r) => (r ?? "").trim())
        .filter(Boolean);

    const site = (params.siteLocationId ?? "").trim();

    if (named.length === 0) {
        // No room named: the fact is contained only if the site itself is one the
        // person is assigned to.
        if (!site || !sites.has(site)) {
            return {
                ok: false,
                code: "location_outside_assignment",
                message: "That location is not covered by your current assignments.",
            };
        }
        return { ok: true };
    }

    for (const room of named) {
        // A room is covered by an explicit room assignment, or by an assignment
        // to the whole site the room belongs to — which is how a floating or
        // site-wide staff commitment is expressed in the same table.
        if (rooms.has(room)) continue;
        if (site && sites.has(site)) continue;
        return {
            ok: false,
            code: "location_outside_assignment",
            message: "That location is not covered by your current assignments.",
        };
    }
    return { ok: true };
}

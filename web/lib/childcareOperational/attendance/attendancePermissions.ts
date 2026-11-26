/**
 * Attendance authorization — capability AND reach, asserted server-side.
 *
 * ── THE DEFECT THIS CLOSES ──
 *
 * Attendance had no capability of its own. Reaching the route WAS the
 * authorization, and the route's gate — `requireAdminOrOps` — does not check a
 * role at all (its own docstring says so; platform issues M2-13 / W-41). The
 * handler then took a service-role client, which bypasses RLS, so the carefully
 * written policies on `child_attendance_events` never ran on that path. The net
 * effect: any portal-eligible principal in the org could author attendance for
 * any child at any site.
 *
 * Thread 2 made provenance honest — the stamp on a fact now truthfully says who
 * wrote it. This makes the authority honest: whether they were allowed to.
 *
 * ── WHY A NARROW PRIMITIVE AND NOT A FIX TO `requireAdminOrOps` ──
 *
 * That helper is shared by many unrelated routes. Making it actually enforce a
 * role would change authorization for every one of them in a single commit, with
 * no per-route certification — a much larger blast radius than the defect, and
 * exactly the "silently broaden" the brief warns against. The narrow primitive
 * fixes Attendance completely today and leaves the shared helper to a change that
 * can certify its own callers.
 *
 * ── TWO INDEPENDENT QUESTIONS ──
 *
 * A permission says WHAT you may do. Site scope says WHERE. Both must pass, and
 * neither substitutes for the other: an org-wide `attendance.record` holder
 * restricted to one site may not capture at another, and a caller scoped to a
 * site with no capability may not capture at all.
 *
 * Reuses the existing platform: `resolveActorPermissionGrants` (user_roles →
 * role_permission_grants) and `locationAllowedUnderSiteScope` (ancestor-walking,
 * so it already understands Thread 1's nested topology). No Attendance RBAC.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import { resolveLinkedPersonId } from "@/lib/access/linkedPersonIdentity";
import {
    assignedScopeCovers,
    resolveAssignedCaptureScope,
} from "@/lib/childcareOperational/attendance/assignedScopeCapture";
import {
    locationAllowedUnderSiteScope,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";

export const ATTENDANCE_RECORD_PERMISSION_KEY = "attendance.record" as const;
export const ATTENDANCE_READ_PERMISSION_KEY = "attendance.read" as const;

export type AttendanceAuthzVerdict =
    | { ok: true }
    | { ok: false; status: 403; code: string; message: string };

/**
 * Trusted context for a non-human producer.
 *
 * Kiosk, integration and door-access channels (Threads 5/6) do not carry a human
 * session, so they cannot answer `resolveActorPermissionGrants`. They must arrive
 * with an authority resolved by their own registration — and until such a
 * resolver exists, they are DENIED here rather than allowed to inherit whatever
 * the surrounding request happened to hold. An unimplemented channel that fails
 * closed is a gap; one that fails open is a breach.
 */
export type NonHumanProducerAuthority = {
    producerKey: string;
    /** Sites this producer is registered for. Empty denies everything. */
    allowedSiteLocationIds: readonly string[];
    grantedPermissionKeys: readonly string[];
};

function deny(code: string, message: string): AttendanceAuthzVerdict {
    return { ok: false, status: 403, code, message };
}

/**
 * Does the caller hold the capability?
 *
 * A grants read that FAILS answers `null`, and null DENIES — an unidentified
 * caller is not an unprivileged one, and collapsing the two is how a broken
 * lookup becomes an open door.
 */
async function assertPermission(
    supabase: SupabaseClient,
    orgId: string,
    userId: string | null | undefined,
    permissionKey: string,
    activity: string,
): Promise<AttendanceAuthzVerdict> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    if (grants.permissionKeys == null) {
        return deny("permission_unresolved", `${activity} could not be authorized.`);
    }
    if (!grants.permissionKeys.includes(permissionKey)) {
        return deny("permission_denied", `${activity} requires ${permissionKey}.`);
    }
    return { ok: true };
}

/**
 * Is every location this fact touches inside the caller's reach?
 *
 * Checks the subject's site AND every referenced room. Checking only the site
 * would let a caller scoped to site A move a child into a room that resolves to
 * site B; checking only the rooms would let an absence — which names no room at
 * all — escape scope entirely.
 */
export async function assertAttendanceLocationsInScope(params: {
    supabase: SupabaseClient;
    orgId: string;
    dim: AdminAccessScopeDimensions;
    siteLocationId: string | null | undefined;
    roomLocationIds?: readonly (string | null | undefined)[];
}): Promise<AttendanceAuthzVerdict> {
    const { supabase, orgId, dim } = params;

    if (dim.siteScope !== "all") {
        if (!params.siteLocationId) {
            return deny("site_unresolved", "This child's site could not be resolved for scope.");
        }
        const siteOk = await locationAllowedUnderSiteScope(supabase, orgId, dim, params.siteLocationId);
        if (!siteOk) {
            return deny("site_out_of_scope", "This child is not at a site you have access to.");
        }
    }

    for (const roomId of params.roomLocationIds ?? []) {
        const room = (roomId ?? "").trim();
        if (!room) continue;
        const roomOk = await locationAllowedUnderSiteScope(supabase, orgId, dim, room);
        if (!roomOk) {
            return deny("location_out_of_scope", "That location is not within your site access.");
        }
    }

    return { ok: true };
}

/**
 * The one gate for authoring an attendance fact — original, correction or
 * reversal alike. A correction is a fact about the same child at the same site,
 * so it is authorized identically; letting corrections through a lighter check
 * would make "correct" the way to write anything.
 */
export async function assertAttendanceCaptureAllowed(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null | undefined;
    dim: AdminAccessScopeDimensions;
    siteLocationId: string | null | undefined;
    roomLocationIds?: readonly (string | null | undefined)[];
    /**
     * The service date the fact belongs to. Required to resolve which staff
     * assignments are in force; omitted, the narrowed policy cannot be evaluated
     * and therefore denies rather than falling back to the wider one.
     */
    serviceDate?: string | null | undefined;
}): Promise<AttendanceAuthzVerdict> {
    // 1 — the capability. WHAT the actor may do.
    const permitted = await assertPermission(
        params.supabase,
        params.orgId,
        params.userId,
        ATTENDANCE_RECORD_PERMISSION_KEY,
        "Recording attendance",
    );
    if (!permitted.ok) return permitted;

    // 2 — ordinary org/site scope. WHERE they may do it.
    const inScope = await assertAttendanceLocationsInScope(params);
    if (!inScope.ok) return inScope;

    /*
     * 3 — WHICH CAPTURE SCOPE POLICY APPLIES.
     *
     * A per-user MODE on the access profile, never a permission. Permissions are
     * additive and union across roles, so expressing this narrowing as a grant
     * would have meant an actor holding both an administrator role and an
     * educator role ended up with LESS attendance authority than the
     * administrator role alone. Adding a role must never reduce access.
     *
     * `site` is the default and today's behaviour, so a director cannot drift
     * into the constrained policy by acquiring a role, an employment record or a
     * schedule assignment — only by someone deliberately setting this mode.
     *
     * It applies AFTER site scope, never instead of it: an assignment names a
     * room, it does not grant reach into a site the actor does not hold, or a
     * stale roster row would become a way across a tenant boundary.
     */
    if ((params.dim.attendanceCaptureScope ?? "site") !== "assigned") {
        return { ok: true };
    }

    const linked = await resolveLinkedPersonId(params.supabase, params.orgId, params.userId);
    if (!linked.resolved) {
        return deny("identity_unresolved", "Your linked person record could not be resolved.");
    }
    if (!linked.personId) {
        // Explicitly not an email fallback. An account nobody has linked is an
        // account whose assignments cannot be known, and guessing is how one
        // teacher inherits another's rooms.
        return deny(
            "identity_not_linked",
            "This account is not linked to a person record, so your room assignments cannot be resolved.",
        );
    }

    const serviceDate = (params.serviceDate ?? "").trim();
    if (!serviceDate) {
        return deny("service_date_required", "A service date is required to resolve your room assignments.");
    }

    const scope = await resolveAssignedCaptureScope({
        supabase: params.supabase,
        orgId: params.orgId,
        personId: linked.personId,
        serviceDate,
    });
    const covered = assignedScopeCovers({
        scope,
        siteLocationId: params.siteLocationId,
        roomLocationIds: params.roomLocationIds,
    });
    if (!covered.ok) return deny(covered.code, covered.message);

    return { ok: true };
}

/** Reading attendance truth. Same two questions, the read capability. */
export async function assertAttendanceReadAllowed(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string | null | undefined;
}): Promise<AttendanceAuthzVerdict> {
    return assertPermission(
        params.supabase,
        params.orgId,
        params.userId,
        ATTENDANCE_READ_PERMISSION_KEY,
        "Viewing attendance",
    );
}

/**
 * Narrow a set of requested sites to those the caller actually holds.
 *
 * A caller's `site_location_id` filter may only NARROW. Returning the
 * intersection (rather than trusting the request) means asking for a site you do
 * not hold yields nothing instead of everything — the same shape the Financials
 * work-queue uses.
 *
 * `null` means "org-wide, no site filter needed".
 */
export function narrowSitesToScope(
    dim: AdminAccessScopeDimensions,
    requestedSiteLocationId: string | null | undefined,
): { siteLocationIds: string[] | null } {
    const requested = (requestedSiteLocationId ?? "").trim() || null;

    if (dim.siteScope === "all") {
        return { siteLocationIds: requested ? [requested] : null };
    }

    const allowed = [...(dim.allowedSiteLocationIds ?? [])].map(String);
    if (!requested) return { siteLocationIds: allowed };
    return { siteLocationIds: allowed.includes(requested) ? [requested] : [] };
}

/**
 * Authorization for a trusted non-human producer.
 *
 * Deliberately explicit and deliberately unreachable today: no channel mints a
 * `NonHumanProducerAuthority` yet, so Threads 5/6 must build the registration
 * that produces one. What this fixes now is the DEFAULT — a kiosk or integration
 * cannot quietly ride a human session's grants, because it has to answer this
 * function instead, and this function denies anything it cannot positively
 * verify.
 */
export async function assertNonHumanCaptureAllowed(params: {
    authority: NonHumanProducerAuthority | null | undefined;
    siteLocationId: string | null | undefined;
}): Promise<AttendanceAuthzVerdict> {
    const authority = params.authority;
    if (!authority || !authority.producerKey.trim()) {
        return deny(
            "producer_unregistered",
            "This producer is not registered to record attendance.",
        );
    }
    if (!authority.grantedPermissionKeys.includes(ATTENDANCE_RECORD_PERMISSION_KEY)) {
        return deny(
            "producer_permission_denied",
            `This producer lacks ${ATTENDANCE_RECORD_PERMISSION_KEY}.`,
        );
    }
    const site = (params.siteLocationId ?? "").trim();
    if (!site || !authority.allowedSiteLocationIds.includes(site)) {
        return deny("producer_site_out_of_scope", "This producer is not registered for that site.");
    }
    return { ok: true };
}

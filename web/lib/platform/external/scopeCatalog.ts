/**
 * The one place that says what a public scope permits.
 *
 * ── WHY A CATALOG AND NOT A STRING COMPARE IN EACH ROUTE ──
 *
 * B.2 enforced scopes but had no central statement of which scope governs which
 * operation, so the knowledge lived in whichever handler happened to check.
 * Scattered `scopes.includes("…")` calls are how two routes end up disagreeing
 * about the same permission, and how a new route quietly ships requiring nothing.
 * A route now names its OPERATION; the catalog decides the scope.
 *
 * ── EXTERNAL SCOPES ARE NOT OPERATOR RBAC ──
 *
 * They are deliberately their own vocabulary, mapped to Alloy authority rather
 * than equal to it. Alloy's internal permission keys describe what a MEMBER may
 * do and are still being reshaped — PR #802 moved financial permissions during
 * Thread 3's own closeout. Publishing them as external scopes would make every
 * internal rename a partner-visible breaking change. The indirection is the
 * product.
 *
 * ── EXACT MATCH, ALWAYS ──
 *
 * No prefix semantics, no wildcards, no hierarchy. A catalog in which
 * `locations` implies `locations.read`, or `locations.read` implies
 * `locations.readwrite`, is one where granting a read quietly grants something
 * else. Read and write are separate entries by construction, so a future
 * `locations.write` cannot be satisfied by a read grant.
 */

import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";
import { hasScope, type AuthorizationVerdict } from "@/lib/platform/principal/principalAuthorization";

export type PublicAccess = "read" | "write";

export type PublicScopeDefinition = {
    scope: string;
    access: PublicAccess;
    /** What this grants, in a developer's words. Feeds the documentation. */
    summary: string;
    /**
     * The Alloy authority actually invoked. Recorded so the mapping from public
     * contract to internal truth is legible, and so a reviewer can see that a
     * scope is not simply a label.
     */
    alloyAuthority: string;
    /**
     * The internal permission keys this scope maps to, if any.
     *
     * This is the ONE declared bridge between the two vocabularies. It is a
     * mapping, never an equality: renaming an internal key changes this line and
     * nothing a partner sees, which is the entire reason the indirection exists.
     * A read scope maps to nothing here — reads are authorized by the boundary
     * and the query, not by an internal permission grant.
     */
    internalPermissionKeys?: readonly string[];
    /**
     * Whether an operator can GRANT this scope when installing an application.
     *
     * Defaults to true. `false` means the catalog still recognises the scope — an installation
     * that already carries it keeps rendering normally — but it is not offered at install time and
     * is not published as part of the partner grant model.
     *
     * There is exactly one of these, and the reason is worth stating: `context.read` never gated
     * anything. `getContext` requires a valid token and no scope, because a caller that cannot
     * discover what it holds cannot diagnose why anything else was refused. Offering a permission
     * that grants nothing teaches operators that these checkboxes are decorative, which is the
     * opposite of what an informed-consent surface is for.
     */
    grantable?: boolean;
};

/** The complete V1 external scope catalog. Small on purpose: it can grow compatibly, it cannot shrink. */
export const PUBLIC_SCOPES = {
    "context.read": {
        scope: "context.read",
        access: "read",
        summary: "Read the calling installation's own context.",
        alloyAuthority: "none — the installation describing itself",
        // Recognised for compatibility, never offered. See `grantable` above.
        grantable: false,
    },
    "locations.read": {
        scope: "locations.read",
        access: "read",
        summary: "Read organizational locations (sites and units) within the installation boundary.",
        alloyAuthority: "public.list_external_locations, boundary-enforced in SQL",
    },
    "attendance.read": {
        scope: "attendance.read",
        access: "read",
        summary: "Read canonical attendance facts for children at locations within the installation boundary.",
        alloyAuthority: "child_attendance_events, boundary-enforced against the same sites GET /api/v1/locations returns",
        /*
         * No internal permission key, and that is the catalog's own rule for a read scope: reads
         * are authorized by the boundary and the query. It is also why this is a SEPARATE entry
         * from `attendance.write` — a partner that may submit a fact has not thereby been granted
         * the ability to read every child's movements, and the catalog forbids one scope implying
         * another by construction.
         */
    },
    "children.read": {
        scope: "children.read",
        access: "read",
        summary: "Read identity and lifecycle for children enrolled at locations within the installation boundary.",
        alloyAuthority: "public.list_external_children — enrollment decides visibility, boundary-enforced in SQL",
    },
    "households.read": {
        scope: "households.read",
        access: "read",
        summary: "Read the household a visible child belongs to.",
        alloyAuthority: "public.list_external_households, boundary-enforced in SQL",
        /*
         * A household is an ANCHOR, never an authority. It appears because a child is already
         * visible, and it grants sight of nothing further — a sibling outside the boundary stays
         * invisible, and the response carries no count and no id that would reveal one exists.
         */
    },
    "relationships.read": {
        scope: "relationships.read",
        access: "read",
        summary: "Read parent and guardian relationships for visible children, including effective pickup authority.",
        alloyAuthority: "public.list_external_relationships, boundary-enforced in SQL",
        /*
         * This is the scope that exposes ADULT identity, which is why it is separate from
         * `children.read`. A partner doing occupancy analytics holds the child scope and never
         * learns a parent's name.
         */
    },
    "relationships.contact.read": {
        scope: "relationships.contact.read",
        access: "read",
        summary: "Read contact points (email, phone) for the people named by visible relationships.",
        alloyAuthority: "public.list_external_relationships, contact columns gated at the source",
        /*
         * A strictly stronger grant than `relationships.read`, and never implied by it. Without
         * this scope the contact columns are NULL in the SQL result — not removed afterwards by a
         * serializer someone could forget to apply.
         */
    },
    "enrollment.read": {
        scope: "enrollment.read",
        access: "read",
        summary: "Read committed enrollment agreements and placements for children within the installation boundary.",
        alloyAuthority: "public.list_external_enrollments and public.list_external_placements, boundary-enforced in SQL",
    },
    "schedule.read": {
        scope: "schedule.read",
        access: "read",
        summary: "Read committed schedule assignments and the derived dated schedule projection.",
        alloyAuthority: "public.list_external_schedule_assignments and public.project_external_schedule_days, boundary-enforced in SQL",
    },
    "enrollment.write": {
        scope: "enrollment.write",
        access: "write",
        summary: "Start, end and void enrollments, and assign, move or cancel room placements, for children at authorized locations.",
        alloyAuthority: "enrollmentAgreementService and childPlacementService, through the external operation adapter",
        /*
         * ONE permission for one operator concept — "manage where this child is enrolled and which
         * room they are in". A placement cannot exist without an agreement to hang from, so
         * splitting these would ask an operator to choose between two halves of a single
         * capability. Create, change and end share it for the same reason: an integration that may
         * start an enrollment but not end one produces records nobody can close.
         */
        internalPermissionKeys: ["enrollment.manage"],
    },
    "schedule.write": {
        scope: "schedule.write",
        access: "write",
        summary: "Set, change and cancel committed schedules for children at authorized locations.",
        alloyAuthority: "scheduleAssignmentService, through the external operation adapter",
        // Never reaches the dated projection: a generated day is a view of the commitment, so
        // changing a day means changing the assignment it came from.
        internalPermissionKeys: ["schedule.manage"],
    },
    "staff.read": {
        scope: "staff.read",
        access: "read",
        summary: "Read staff — person and employment composed — assigned to locations within the installation boundary.",
        alloyAuthority: "public.list_external_staff, boundary-enforced in SQL",
    },
    "staff.contact.read": {
        scope: "staff.contact.read",
        access: "read",
        summary: "Read contact points (email, phone) for visible staff.",
        alloyAuthority: "public.list_external_staff, contact columns gated at the source",
    },
    "attendance.write": {
        scope: "attendance.write",
        access: "write",
        summary: "Submit attendance events for children at authorized locations.",
        alloyAuthority: "record_child_attendance_event, via the Attendance authority adapter",
        // The external scope a partner is granted; the internal permission the
        // attendance gate actually checks. Two names, deliberately, so the
        // internal one can be renamed without breaking a partner.
        internalPermissionKeys: ["attendance.record"],
    },
} as const satisfies Record<string, PublicScopeDefinition>;

export type PublicScope = keyof typeof PUBLIC_SCOPES;

/**
 * Every public operation, and the scope it requires.
 *
 * The operation id is the same string the OpenAPI artifact and the activity log
 * use, so "what did this caller do", "what does the contract say" and "what did
 * we require" cannot drift into three different vocabularies.
 */
export const PUBLIC_OPERATIONS = {
    getContext: { operationId: "getContext", scope: null, route: "/api/v1/context" },
    issueAccessToken: { operationId: "issueAccessToken", scope: null, route: "/api/v1/oauth/token" },
    listLocations: { operationId: "listLocations", scope: "locations.read", route: "/api/v1/locations" },
    listAttendanceEvents: {
        operationId: "listAttendanceEvents",
        scope: "attendance.read",
        route: "/api/v1/attendance-events",
    },
    /*
     * The write on the same resource, and a SEPARATE scope from the read.
     *
     * The catalog forbids hierarchy by construction, so this is not a courtesy: an installation
     * granted only `attendance.write` submits facts and cannot read anyone's history back, and one
     * granted only `attendance.read` cannot author. A producer that needs both is granted both.
     */
    submitAttendanceEvents: {
        operationId: "submitAttendanceEvents",
        scope: "attendance.write",
        route: "/api/v1/attendance-events",
    },
    listChildren: { operationId: "listChildren", scope: "children.read", route: "/api/v1/children" },
    listHouseholds: { operationId: "listHouseholds", scope: "households.read", route: "/api/v1/households" },
    listRelationships: {
        operationId: "listRelationships",
        scope: "relationships.read",
        route: "/api/v1/relationships",
    },
    listEnrollments: { operationId: "listEnrollments", scope: "enrollment.read", route: "/api/v1/enrollments" },
    listPlacements: { operationId: "listPlacements", scope: "enrollment.read", route: "/api/v1/placements" },
    listScheduleAssignments: {
        operationId: "listScheduleAssignments",
        scope: "schedule.read",
        route: "/api/v1/schedule-assignments",
    },
    /*
     * The DERIVED half of the schedule contract, deliberately sharing `schedule.read` with the
     * canonical half: they answer two questions about one authority, and a partner entitled to the
     * standing commitment is entitled to the days it implies.
     */
    listScheduleDays: {
        operationId: "listScheduleDays",
        scope: "schedule.read",
        route: "/api/v1/schedule-days",
    },
    listStaff: { operationId: "listStaff", scope: "staff.read", route: "/api/v1/staff" },

    /*
     * GOVERNED OPERATIONS — named intents, never field mutation.
     *
     * Each delegates to the canonical service that already performs it internally. The public
     * surface has no PUT, PATCH or DELETE anywhere, and these do not add one: a change is a
     * supersession, and an ending is an ending.
     */
    startEnrollment: { operationId: "startEnrollment", scope: "enrollment.write", route: "/api/v1/enrollments" },
    endEnrollment: {
        operationId: "endEnrollment",
        scope: "enrollment.write",
        route: "/api/v1/enrollments/end",
    },
    // Voiding is the same capability as starting or ending an enrollment — deciding whether a child
    // is in service. It is guarded by evidence, not by a separate scope.
    voidEnrollment: {
        operationId: "voidEnrollment",
        scope: "enrollment.write",
        route: "/api/v1/enrollments/void",
    },
    assignPlacement: { operationId: "assignPlacement", scope: "enrollment.write", route: "/api/v1/placements" },
    movePlacement: { operationId: "movePlacement", scope: "enrollment.write", route: "/api/v1/placements/move" },
    // Cancelling a placement is the same capability as creating or moving one — deciding where a
    // child sits. A separate scope would count endpoints, not capabilities, and would let an
    // installation hold "move" while being refused the honest correction for a move it should
    // never have made.
    cancelPlacement: { operationId: "cancelPlacement", scope: "enrollment.write", route: "/api/v1/placements/cancel" },
    setScheduleAssignment: {
        operationId: "setScheduleAssignment",
        scope: "schedule.write",
        route: "/api/v1/schedule-assignments",
    },
    changeScheduleAssignment: {
        operationId: "changeScheduleAssignment",
        scope: "schedule.write",
        route: "/api/v1/schedule-assignments/change",
    },
    cancelScheduleAssignment: {
        operationId: "cancelScheduleAssignment",
        scope: "schedule.write",
        route: "/api/v1/schedule-assignments/cancel",
    },
} as const satisfies Record<
    string,
    { operationId: string; scope: PublicScope | null; route: string }
>;

export type PublicOperationId = keyof typeof PUBLIC_OPERATIONS;

/**
 * `getContext` requires no scope deliberately: it reports the installation's own
 * identity and grants, and a caller that cannot discover what it holds cannot
 * debug why anything else was refused. It exposes no domain data, so there is
 * nothing for a scope to protect.
 */
export function scopeForOperation(operationId: PublicOperationId): PublicScope | null {
    return PUBLIC_OPERATIONS[operationId].scope;
}

export function requireOperationScope(
    principal: ApplicationPrincipal,
    operationId: PublicOperationId,
): AuthorizationVerdict {
    const required = scopeForOperation(operationId);
    if (required === null) return { ok: true };

    // Exact membership. `hasScope` does no prefix matching, and this is the only
    // place the requirement is decided.
    if (hasScope(principal, required)) return { ok: true };

    return {
        ok: false,
        code: "forbidden_scope",
        message: `This installation has not been granted ${required}.`,
    };
}

/**
 * Every scope an operator can actually grant — the install-time permission model, and what the
 * partner documentation publishes.
 */
export function allPublicScopes(): PublicScopeDefinition[] {
    // `as const satisfies` narrows each entry to its own literal type, so the union does not carry
    // the optional key. Read through the declared shape rather than the inferred one.
    return (Object.values(PUBLIC_SCOPES) as PublicScopeDefinition[]).filter((d) => d.grantable !== false);
}

/**
 * Every scope the catalog RECOGNISES, grantable or not.
 *
 * The distinction matters for installations that already hold a scope which is no longer offered:
 * they must keep presenting as a known, explainable permission rather than degrading to the
 * "unrecognised" state reserved for strings the platform genuinely cannot explain.
 */
export function allKnownScopes(): PublicScopeDefinition[] {
    return Object.values(PUBLIC_SCOPES) as PublicScopeDefinition[];
}

/**
 * Whether an operation READS or WRITES, decided by the catalog rather than by its HTTP verb.
 *
 * This is what the rate limiter classifies on. Deriving it from the method would be one `POST`
 * away from wrong — token exchange is a POST that is neither — and deriving it per route would let
 * a new operation pick its own class. The catalog already records `access` on every scope, so the
 * answer exists; this is the one place that reads it.
 *
 * `getContext` holds no scope and is a read: it reports what the installation already has.
 */
export function accessForOperation(operationId: PublicOperationId): PublicAccess {
    const scope = scopeForOperation(operationId);
    if (scope === null) return "read";
    return PUBLIC_SCOPES[scope].access;
}

/**
 * Map granted PUBLIC scopes to the internal permission keys they imply.
 *
 * Unknown scopes contribute nothing — a scope the catalog does not define cannot
 * grant internal authority, which is what keeps a stray string in an
 * installation row from becoming a permission.
 */
export function internalPermissionsForScopes(scopes: readonly string[]): string[] {
    const out = new Set<string>();
    for (const scope of scopes) {
        const definition = (PUBLIC_SCOPES as Record<string, PublicScopeDefinition>)[scope];
        for (const key of definition?.internalPermissionKeys ?? []) out.add(key);
    }
    return [...out];
}

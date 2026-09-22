/**
 * Turning the scope catalog into something an operator can consent to.
 *
 * ── A WALL OF STRINGS IS NOT INFORMED CONSENT ──
 *
 * Showing `locations.read` as the primary experience asks a childcare operator to
 * approve a token they cannot evaluate. The decision they are actually making is
 * "may this software see my sites and rooms", and that is what the surface should
 * say. The raw scope remains available under developer detail, because a
 * developer debugging a 403 needs the exact string.
 *
 * ── ONE REGISTRY, NEVER TWO ──
 *
 * Every entry here DERIVES from `PUBLIC_SCOPES`. This module adds words; it never
 * adds authority, and it cannot grant a scope the catalog does not define. A
 * second capability registry inside the UI is how a label and a permission drift
 * apart until the label is a lie.
 *
 * ── UNKNOWN FAILS SAFE ──
 *
 * A scope with no presentation renders as itself, marked unrecognised, and is
 * never described in friendly language nobody wrote. Inventing a description for
 * an unknown grant is how an operator approves something the platform could not
 * explain.
 */

import { PUBLIC_SCOPES, type PublicScopeDefinition } from "@/lib/platform/external/scopeCatalog";

export type ScopePresentation = {
    scope: string;
    /** What the operator reads. */
    title: string;
    detail: string;
    /** Reads and writes must never look alike. */
    access: "read" | "write";
    /** False when the catalog does not define this scope. */
    recognised: boolean;
};

/**
 * FROZEN OPERATOR COPY.
 *
 * These sentences are the permission model as an operator experiences it, and they are ratified
 * rather than editorial. Changing one changes what a childcare operator believes they approved, so
 * a change here is a product decision, not a wording tweak.
 *
 * Each says what the integration may READ, and — where it matters — what it still may not.
 */
const PRESENTATION: Record<string, { title: string; detail: string }> = {
    "context.read": {
        title: "Connection details",
        detail: "See which organization and locations this integration is connected to. Every integration can do this; it is not a permission you grant separately.",
    },
    "locations.read": {
        title: "Locations",
        detail: "Read authorized sites, rooms, and operational units.",
    },
    "children.read": {
        title: "Children in service",
        detail: "Read children currently in service within authorized locations. No health, allergy or safeguarding information is ever included.",
    },
    "households.read": {
        title: "Households",
        detail: "Read the household shell for visible children. This does not reveal siblings at locations you have not authorized.",
    },
    "relationships.read": {
        title: "Parents and guardians",
        detail: "Read visible child-adult relationships and effective pickup authority. Reasons are never shared — only the answer.",
    },
    "relationships.contact.read": {
        title: "Parent and guardian contact details",
        detail: "Read email and phone for adults already visible through relationships. This is a separate permission from seeing who they are.",
    },
    "enrollment.read": {
        title: "Enrollment and placement",
        detail: "Read enrollment agreements and placements for visible children.",
    },
    "schedule.read": {
        title: "Schedules",
        detail: "Read committed schedules and dated schedule projections for visible children.",
    },
    "staff.read": {
        title: "Staff",
        detail: "Read staff assigned to authorized locations. Pay, payroll and HR records are never shared.",
    },
    "staff.contact.read": {
        title: "Staff contact details",
        detail: "Read email and phone for staff already visible through staff access.",
    },
    "attendance.read": {
        title: "Attendance history",
        detail: "Read attendance history for visible children.",
    },
    "attendance.write": {
        title: "Record attendance",
        detail: "Submit attendance facts for visible children.",
    },
};

export function presentScope(scope: string): ScopePresentation {
    const definition = (PUBLIC_SCOPES as Record<string, PublicScopeDefinition>)[scope];
    const words = PRESENTATION[scope];

    if (!definition || !words) {
        return {
            scope,
            title: scope,
            detail: "This permission is not recognised by this version of Alloy.",
            // An unrecognised scope is treated as the more dangerous kind, so it
            // can never be presented as a harmless read.
            access: "write",
            recognised: false,
        };
    }

    return { scope, title: words.title, detail: words.detail, access: definition.access, recognised: true };
}

export function presentScopes(scopes: readonly string[]): ScopePresentation[] {
    return scopes.map(presentScope);
}

/** Every scope the catalog defines has words. Locked by test so the two cannot drift. */
export function scopesMissingPresentation(): string[] {
    return Object.keys(PUBLIC_SCOPES).filter((s) => !PRESENTATION[s]);
}

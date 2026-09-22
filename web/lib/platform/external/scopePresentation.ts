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

const PRESENTATION: Record<string, { title: string; detail: string }> = {
    "context.read": {
        title: "Connection details",
        detail: "See which organization and locations this integration is connected to.",
    },
    "locations.read": {
        title: "Locations",
        detail: "View your sites and the rooms within them. No addresses or access codes are shared.",
    },
    "attendance.read": {
        title: "Attendance history",
        detail: "View when children arrived, left and moved between rooms at the locations you allow. Read only — this does not let the integration record anything.",
    },
    "attendance.write": {
        title: "Attendance",
        detail: "Record children arriving, leaving and moving between rooms at the locations you allow.",
    },
    "children.read": {
        title: "Children in your care",
        detail: "View the name, date of birth and enrolment status of children attending the locations you allow. Only children who are actually enrolled there are shared. No health, allergy or safeguarding information is ever included.",
    },
    "households.read": {
        title: "Families",
        detail: "View the family a child belongs to, so siblings can be grouped. This does not share children at locations you have not allowed, and no billing or payment details are included.",
    },
    "relationships.read": {
        title: "Parents and guardians",
        detail: "View which adults are related to each child, and whether each one is currently allowed to collect them. Reasons are never shared — only the answer.",
    },
    "relationships.contact.read": {
        title: "Parent and guardian contact details",
        detail: "View the email address and phone number of those parents and guardians. This is a separate permission from seeing who they are, and you can allow one without the other.",
    },
    "enrollment.read": {
        title: "Enrolment and room placement",
        detail: "View which children are enrolled at which site, which room they are placed in, and from when.",
    },
    "schedule.read": {
        title: "Schedules",
        detail: "View the days each child is scheduled to attend, and work out who is expected on a given day.",
    },
    "staff.read": {
        title: "Staff",
        detail: "View the names, job titles and employment status of staff assigned to the locations you allow. Pay, payroll and HR records are never shared.",
    },
    "staff.contact.read": {
        title: "Staff contact details",
        detail: "View the email address and phone number of those staff. This is a separate permission from seeing who they are.",
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

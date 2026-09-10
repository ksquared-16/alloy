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

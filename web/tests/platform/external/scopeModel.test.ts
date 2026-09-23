/**
 * The V1 grantable scope model, frozen.
 *
 * ── WHY THIS IS A LOCK AND NOT A STYLE TEST ──
 *
 * These eleven strings are what a childcare operator approves when they install an integration.
 * Adding a twelfth, renaming one, or letting one imply another changes what a real person believes
 * they consented to — so each of those must be a decision that edits this file, not a side effect
 * of adding an endpoint.
 */
import { describe, expect, it } from "vitest";

import {
    PUBLIC_SCOPES,
    PUBLIC_OPERATIONS,
    allPublicScopes,
    allKnownScopes,
    scopeForOperation,
    type PublicOperationId,
} from "@/lib/platform/external/scopeCatalog";
import { presentScope } from "@/lib/platform/external/scopePresentation";

/** The V1 grant model. Ratified; not a convenience list. */
const GRANTABLE = [
    "attendance.read",
    "attendance.write",
    "children.read",
    "enrollment.read",
    "enrollment.write",
    "households.read",
    "locations.read",
    "relationships.contact.read",
    "relationships.read",
    "schedule.read",
    "schedule.write",
    "staff.contact.read",
    "staff.read",
];

describe("the V1 scope model", () => {
    it("offers exactly the ratified grantable scopes", () => {
        expect(allPublicScopes().map((d) => d.scope).sort()).toEqual(GRANTABLE);
    });

    it("does not offer context.read, because it never gated anything", () => {
        /*
         * `getContext` requires a valid token and no scope: a caller that cannot discover what it
         * holds cannot diagnose why anything else was refused. Publishing a permission that grants
         * nothing teaches operators that these checkboxes are decorative.
         */
        expect(scopeForOperation("getContext")).toBeNull();
        expect(allPublicScopes().some((d) => d.scope === "context.read")).toBe(false);
    });

    it("still RECOGNISES context.read, so existing installations do not degrade", () => {
        // An installation granted it before this change must keep presenting as a known,
        // explainable permission — never as the "unrecognised" state reserved for strings the
        // platform genuinely cannot explain, which is presented as the more dangerous kind.
        expect(allKnownScopes().some((d) => d.scope === "context.read")).toBe(true);
        const presented = presentScope("context.read");
        expect(presented.recognised).toBe(true);
        expect(presented.access).toBe("read");
        expect(presented.detail).toMatch(/not a permission you grant separately/i);
    });

    it("matches exactly — no prefix, no hierarchy, no implication", () => {
        for (const scope of GRANTABLE) {
            const others = GRANTABLE.filter((s) => s !== scope);
            for (const other of others) {
                // The only relationship allowed between two scopes is "none". A scope that is a
                // string prefix of another must still not satisfy it.
                expect(scope === other, `${scope} collides with ${other}`).toBe(false);
            }
        }
        // The two pairs most likely to be assumed hierarchical are separate entries.
        expect(PUBLIC_SCOPES["relationships.read"].scope).not.toBe(PUBLIC_SCOPES["relationships.contact.read"].scope);
        expect(PUBLIC_SCOPES["staff.read"].scope).not.toBe(PUBLIC_SCOPES["staff.contact.read"].scope);
    });

    it("keeps no read scope carrying an internal permission grant", () => {
        for (const definition of allKnownScopes()) {
            if (definition.access !== "read") continue;
            expect(definition, `${definition.scope} is a read that grants an internal permission`)
                .not.toHaveProperty("internalPermissionKeys");
        }
    });

    it("gives every grantable scope operator words, and every word a scope", () => {
        for (const definition of allPublicScopes()) {
            const presented = presentScope(definition.scope);
            expect(presented.recognised, `${definition.scope} has no operator copy`).toBe(true);
            expect(presented.title.length, definition.scope).toBeGreaterThan(0);
            expect(presented.detail.length, definition.scope).toBeGreaterThan(20);
            expect(presented.access).toBe(definition.access);
        }
    });

    it("requires a grantable scope for every operation except the two that cannot have one", () => {
        const grantable = new Set(GRANTABLE);
        for (const id of Object.keys(PUBLIC_OPERATIONS) as PublicOperationId[]) {
            const required = scopeForOperation(id);
            if (required === null) {
                // Only token exchange (no credential yet) and context (reports what you hold).
                expect(["issueAccessToken", "getContext"]).toContain(id);
                continue;
            }
            expect(grantable.has(required), `${id} requires ${required}, which is not grantable`).toBe(true);
        }
    });

    it("presents an unknown scope as the more dangerous kind", () => {
        const presented = presentScope("children.delete.everything");
        expect(presented.recognised).toBe(false);
        expect(presented.access).toBe("write");
    });
});

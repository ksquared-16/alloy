/**
 * ROTATE AND REVOKE NEED AN ACTIVE CREDENTIAL, NOT MERELY A CREDENTIAL.
 *
 * Found by Thread 5 Gate 2 mounted certification. A revoked credential is still returned by the
 * installation detail API — deliberately, so the surface can say "Revoked · ends zXZ4" rather than
 * forget it existed. The buttons gated on `!installation.credential`, which a revoked credential
 * satisfies, so both stayed live after a revoke.
 *
 * Pressed in that state on staging, the server answered `credential_not_active` and resurrected
 * nothing, so this was never a security hole — it was a dead control that spent a round trip to say
 * no. The label directly above the buttons already read `status`; only the buttons asked the weaker
 * question.
 *
 * `rotating` must stay actionable: that is an active credential inside its rotation overlap window,
 * not a retired one. This is asserted explicitly because a naive "only active" reading would break
 * rotation-during-overlap, which is the one moment rotation matters most.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = resolve(
    __dirname,
    "../../../app/adminV2/settings/organization/integrations/InstallationDetail.tsx",
);

/** The predicate as the component computes it, extracted so the rule itself is under test. */
function credentialIsActive(credential: { status?: string | null } | null): boolean {
    return credential != null && credential.status !== "revoked";
}

describe("credential controls require an active credential", () => {
    it("a revoked credential is not actionable", () => {
        expect(credentialIsActive({ status: "revoked" })).toBe(false);
    });

    it("an active credential is actionable", () => {
        expect(credentialIsActive({ status: "active" })).toBe(true);
    });

    it("a credential mid-rotation stays actionable — overlap is still active", () => {
        expect(credentialIsActive({ status: "rotating" })).toBe(true);
    });

    it("an absent credential is not actionable", () => {
        expect(credentialIsActive(null)).toBe(false);
    });

    it("a credential with no stated status is treated as active, matching the server", () => {
        // `integrationsService` reads `String(c.status ?? "active") !== "revoked"`.
        expect(credentialIsActive({ status: null })).toBe(true);
    });

    /*
     * The regression itself. `!installation.credential` is what shipped, and it cannot distinguish a
     * revoked credential from an active one — so this pins the component to the status-aware
     * predicate rather than to presence.
     */
    it("the component gates rotate and revoke on the active predicate, not on presence", () => {
        const src = readFileSync(SOURCE, "utf8");
        expect(src).toContain("const credentialIsActive");
        expect(src).toContain('installation.credential.status !== "revoked"');
        for (const control of ["credential-rotate", "credential-revoke"]) {
            const line = src.split("\n").find((l) => l.includes(`data-testid="${control}"`)) ?? "";
            expect(line, `${control} must gate on credentialIsActive`).toContain("!credentialIsActive");
            expect(line, `${control} must not gate on mere presence`).not.toContain("!installation.credential");
        }
    });

    it("Issue stays available when no credential is active — that is how you recover", () => {
        const src = readFileSync(SOURCE, "utf8");
        const line = src.split("\n").find((l) => l.includes('data-testid="credential-issue"')) ?? "";
        expect(line).toContain("disabled={busy}");
        expect(line).not.toContain("credentialIsActive");
    });
});

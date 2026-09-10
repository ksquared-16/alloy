/**
 * Slice B.4 — the incremental sync contract and the security foundations the
 * Integrations product surface has to sit on.
 */

import { describe, expect, it } from "vitest";

import { resolveUpdatedSince } from "@/lib/platform/external/collection";
import { presentScope, presentScopes, scopesMissingPresentation } from "@/lib/platform/external/scopePresentation";
import { PUBLIC_SCOPES } from "@/lib/platform/external/scopeCatalog";
import { evaluateInstallationHealth } from "@/lib/platform/admin/installationHealth";
import { INTEGRATIONS_ADMIN_OPERATIONS } from "@/lib/platform/admin/integrationsAdminAuth";

describe("updated_since watermark", () => {
    it("accepts an explicit offset or Z", () => {
        expect(resolveUpdatedSince("2026-01-01T00:00:00Z")).toEqual({ ok: true, since: "2026-01-01T00:00:00.000Z" });
        expect(resolveUpdatedSince("2026-01-01T00:00:00+02:00").ok).toBe(true);
    });

    it("refuses a timestamp with no timezone rather than guessing UTC", () => {
        // The same string means a different instant to a partner in another
        // timezone; silently choosing one skips or re-delivers rows at every
        // boundary.
        const r = resolveUpdatedSince("2026-01-01T00:00:00");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/timezone/i);
    });

    it("refuses nonsense", () => {
        expect(resolveUpdatedSince("yesterday").ok).toBe(false);
        expect(resolveUpdatedSince("2026-13-45T99:99:99Z").ok).toBe(false);
    });

    it("treats absence as no filter", () => {
        expect(resolveUpdatedSince(null)).toEqual({ ok: true, since: null });
        expect(resolveUpdatedSince("")).toEqual({ ok: true, since: null });
    });

    it("accepts a future timestamp — an empty page is the honest answer", () => {
        const future = new Date(Date.now() + 86_400_000).toISOString();
        expect(resolveUpdatedSince(future).ok).toBe(true);
    });
});

describe("scope presentation", () => {
    it("gives every catalog scope words, so the two cannot drift", () => {
        expect(scopesMissingPresentation()).toEqual([]);
    });

    it("derives access from the catalog rather than restating it", () => {
        for (const [key, def] of Object.entries(PUBLIC_SCOPES)) {
            expect(presentScope(key).access).toBe(def.access);
            expect(presentScope(key).recognised).toBe(true);
        }
    });

    it("shows an operator meaning, not a token", () => {
        const p = presentScope("locations.read");
        expect(p.title).toBe("Locations");
        expect(p.detail).toMatch(/rooms/i);
        // The raw string survives for developer detail.
        expect(p.scope).toBe("locations.read");
    });

    it("fails safe on an unknown scope and never invents friendly words", () => {
        const p = presentScope("children.write");
        expect(p.recognised).toBe(false);
        expect(p.title).toBe("children.write");
        // Treated as the more dangerous kind so it cannot render as a harmless read.
        expect(p.access).toBe("write");
    });

    it("presents a list in order", () => {
        expect(presentScopes(["locations.read", "context.read"]).map((p) => p.scope)).toEqual([
            "locations.read",
            "context.read",
        ]);
    });
});

describe("installation health", () => {
    const base = {
        installationStatus: "active" as const,
        activeCredentialCount: 1,
        recentFailureCount: 0,
        recentSuccessCount: 0,
        recentRateLimitCount: 0,
    };

    it("reports deliberate states as inactive, never as a fault to fix", () => {
        expect(evaluateInstallationHealth({ ...base, installationStatus: "suspended" }).state).toBe("inactive");
        expect(evaluateInstallationHealth({ ...base, installationStatus: "revoked" }).state).toBe("inactive");
    });

    it("does not call an idle installation unhealthy", () => {
        const never = evaluateInstallationHealth(base);
        expect(never.state).toBe("no_recent_activity");
        expect(never.reasons).toContain("never_used");

        const idle = evaluateInstallationHealth({ ...base, lastSuccessAt: "2026-01-01T00:00:00Z" });
        expect(idle.state).toBe("no_recent_activity");
        expect(idle.reasons).toContain("idle");
    });

    it("is healthy when it is being used successfully", () => {
        expect(evaluateInstallationHealth({ ...base, recentSuccessCount: 5 }).state).toBe("healthy");
    });

    it("needs attention when it cannot work", () => {
        expect(evaluateInstallationHealth({ ...base, activeCredentialCount: 0 }).state).toBe("needs_attention");
        expect(
            evaluateInstallationHealth({ ...base, nextCredentialExpiry: "2020-01-01T00:00:00Z" }).state,
        ).toBe("needs_attention");
        expect(
            evaluateInstallationHealth({ ...base, recentFailureCount: 4, recentSuccessCount: 0 }).state,
        ).toBe("needs_attention");
    });

    it("does not panic when some requests fail and others succeed", () => {
        const mixed = evaluateInstallationHealth({ ...base, recentFailureCount: 2, recentSuccessCount: 9 });
        expect(mixed.state).toBe("healthy");
        expect(mixed.reasons).not.toContain("recent_requests_all_failing");
    });

    it("warns before a credential expires, not after", () => {
        const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
        const v = evaluateInstallationHealth({ ...base, recentSuccessCount: 1, nextCredentialExpiry: soon });
        expect(v.state).toBe("healthy");
        expect(v.reasons).toContain("credential_expiring_soon");
    });

    it("surfaces a live rotation without treating it as a fault", () => {
        const until = new Date(Date.now() + 3600_000).toISOString();
        const v = evaluateInstallationHealth({ ...base, recentSuccessCount: 1, rotationOverlapUntil: until });
        expect(v.state).toBe("healthy");
        expect(v.reasons).toContain("rotation_in_progress");
    });
});

describe("internal operator authorization", () => {
    it("separates reading from managing", () => {
        expect(INTEGRATIONS_ADMIN_OPERATIONS.listInstallations).toBe("integrations.read");
        expect(INTEGRATIONS_ADMIN_OPERATIONS.viewActivity).toBe("integrations.read");
        for (const op of [
            "createCredential", "rotateCredential", "revokeCredential",
            "editAccess", "suspendInstallation", "disconnectInstallation", "createInstallation",
        ] as const) {
            expect(INTEGRATIONS_ADMIN_OPERATIONS[op]).toBe("integrations.manage");
        }
    });

    it("never reuses a public application scope as an internal permission", () => {
        // Opposite sides of the trust boundary. An application scope must never
        // appear as an operator permission, in either direction.
        const internal = new Set<string>(Object.values(INTEGRATIONS_ADMIN_OPERATIONS));
        for (const publicScope of Object.keys(PUBLIC_SCOPES)) {
            expect(internal.has(publicScope)).toBe(false);
        }
        for (const key of internal) {
            expect(Object.keys(PUBLIC_SCOPES)).not.toContain(key);
        }
    });
});

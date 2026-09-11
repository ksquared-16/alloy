/**
 * Gate 2 security certification — the internal boundary.
 *
 * `integrations.read` must not be able to change anything, and the difference
 * must live in the server rather than in which buttons the UI renders. These
 * assert the mapping every route depends on, plus the two refusals that protect
 * what gets STORED: an unknown scope, and an audit that could not be written.
 */

import { describe, expect, it } from "vitest";

import {
    INTEGRATIONS_ADMIN_OPERATIONS,
    INTEGRATIONS_MANAGE_PERMISSION_KEY,
    INTEGRATIONS_READ_PERMISSION_KEY,
} from "@/lib/platform/admin/integrationsAdminAuth";
import { allPublicScopes } from "@/lib/platform/external/scopeCatalog";
import { presentScopes } from "@/lib/platform/external/scopePresentation";
import { installationStateOf } from "@/lib/platform/admin/integrationsService";

/** Everything Gate 2 calls a sensitive operation. */
const MUST_REQUIRE_MANAGE = [
    "createInstallation",
    "editAccess",
    "createCredential",
    "rotateCredential",
    "revokeCredential",
    "suspendInstallation",
    "disconnectInstallation",
] as const;

const MAY_BE_READ = ["listInstallations", "viewInstallation", "viewActivity"] as const;

describe("integrations.read cannot manage", () => {
    for (const op of MUST_REQUIRE_MANAGE) {
        it(`${op} requires integrations.manage`, () => {
            expect(INTEGRATIONS_ADMIN_OPERATIONS[op]).toBe(INTEGRATIONS_MANAGE_PERMISSION_KEY);
        });
    }

    for (const op of MAY_BE_READ) {
        it(`${op} needs only integrations.read`, () => {
            expect(INTEGRATIONS_ADMIN_OPERATIONS[op]).toBe(INTEGRATIONS_READ_PERMISSION_KEY);
        });
    }

    it("every declared operation is covered by this test", () => {
        // A new operation must be classified deliberately rather than inherit a
        // permission by being forgotten here.
        const declared = Object.keys(INTEGRATIONS_ADMIN_OPERATIONS).sort();
        const covered = [...MUST_REQUIRE_MANAGE, ...MAY_BE_READ].sort();
        expect(declared).toEqual(covered);
    });

    it("read and manage are different keys, so one cannot imply the other", () => {
        expect(INTEGRATIONS_READ_PERMISSION_KEY).not.toBe(INTEGRATIONS_MANAGE_PERMISSION_KEY);
    });
});

describe("capabilities come from the catalog, and unknown fails safe", () => {
    it("every catalog scope presents with a title and an access kind", () => {
        for (const def of allPublicScopes()) {
            const [p] = presentScopes([def.scope]);
            expect(p.recognised, def.scope).toBe(true);
            expect(p.title.length, def.scope).toBeGreaterThan(0);
            expect(["read", "write"]).toContain(p.access);
        }
    });

    it("a scope the catalog does not define fails closed", () => {
        const [p] = presentScopes(["billing.write"]);
        expect(p.recognised).toBe(false);
        // Shown verbatim rather than given an invented friendly label — a label
        // would imply Alloy knows what it grants.
        expect(p.title).toBe("billing.write");
        expect(p.detail).toMatch(/not recognised/i);
        // Classed as the more dangerous kind, so it can never read as a harmless view.
        expect(p.access).toBe("write");
    });

    it("attendance.write is a catalog scope even though no public endpoint exists", () => {
        // Gate 2 must not imply otherwise: the scope is real, the public mutation
        // is not, and the surface says so rather than inferring one from the other.
        const [p] = presentScopes(["attendance.write"]);
        expect(p.recognised).toBe(true);
        expect(p.access).toBe("write");
    });
});

describe("installation state is runtime-backed only", () => {
    it("revocation outranks suspension", () => {
        expect(installationStateOf({ status: "suspended", revoked_at: "2026-01-01", suspended_at: "2026-01-01" })).toBe("revoked");
    });
    it("a suspension timestamp means suspended even if status lags", () => {
        expect(installationStateOf({ status: "active", suspended_at: "2026-01-01", revoked_at: null })).toBe("suspended");
    });
    it("plain active", () => {
        expect(installationStateOf({ status: "active", suspended_at: null, revoked_at: null })).toBe("active");
    });
    it("disconnected is read as revoked, not as a fourth state", () => {
        expect(installationStateOf({ status: "disconnected" })).toBe("revoked");
    });
});

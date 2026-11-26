/**
 * Slice B.1 certification — the external trust boundary, proven from the
 * refusals inward.
 *
 * The value of this substrate is measured by what it declines to hand a caller.
 * So the tenant-isolation and boundary cases are the point, and the happy path
 * exists mainly to prove the refusals are not vacuous.
 */

import { describe, expect, it } from "vitest";

import { createFakeSupabase, type Tables } from "./fakeSupabase";
import {
    hashCredentialSecret,
    issueCredential,
    revokeCredential,
    rotateCredential,
} from "@/lib/platform/principal/applicationCredential";
import { resolveApplicationPrincipal } from "@/lib/platform/principal/resolveApplicationPrincipal";
import {
    assertLocation,
    assertScope,
    hasScope,
    locationAllowed,
    narrowLocations,
} from "@/lib/platform/principal/principalAuthorization";
import { recordSecurityAudit } from "@/lib/platform/principal/securityAudit";
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";

const ORG_A = "org-a";
const ORG_B = "org-b";
const LOC_A1 = "loc-a1";
const LOC_A2 = "loc-a2";

/** Two organizations, two applications, two installations. */
function seed(): Tables {
    return {
        developer_applications: [
            { id: "app-1", slug: "attendance-partner", ownership_mode: "partner_managed", environment: "production", status: "active" },
            { id: "app-2", slug: "tenant-tool", ownership_mode: "tenant_private", environment: "production", status: "active" },
        ],
        app_installations: [
            {
                id: "inst-a", application_id: "app-1", org_id: ORG_A,
                granted_scopes: ["attendance.write", "children.read"],
                boundary_mode: "locations", location_boundary: [LOC_A1],
                producer_key: "partner:org-a", status: "active",
            },
            {
                id: "inst-b", application_id: "app-2", org_id: ORG_B,
                granted_scopes: ["children.read"],
                boundary_mode: "org_wide", location_boundary: [],
                producer_key: "tool:org-b", status: "active",
            },
        ],
        app_credentials: [],
        app_security_audit: [],
    };
}

async function issueFor(fake: ReturnType<typeof createFakeSupabase>, installationId: string) {
    const res = await issueCredential(fake.client, { installationId, label: "test" });
    if (!res.ok) throw new Error(`issue failed: ${res.reason}`);
    return res.issued;
}

describe("credential issuance", () => {
    it("returns the plaintext secret exactly once and never persists it", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");

        expect(issued.clientSecret).toMatch(/^alloy_sk_/);

        const row = fake.rows("app_credentials")[0];
        const serialized = JSON.stringify(row);

        // The plaintext appears nowhere in the stored row, in any field.
        expect(serialized).not.toContain(issued.clientSecret);
        // What IS stored is the digest, and only the digest.
        expect(row.secret_hash).toBe(hashCredentialSecret(issued.clientSecret));
        // The last four are a disambiguator, not a head start on 256 bits.
        expect(row.secret_last_four).toBe(issued.clientSecret.slice(-4));
    });

    it("mints a distinct secret every time", async () => {
        const fake = createFakeSupabase(seed());
        const a = await issueFor(fake, "inst-a");
        const b = await issueFor(fake, "inst-a");
        expect(a.clientSecret).not.toBe(b.clientSecret);
        expect(a.clientId).not.toBe(b.clientId);
    });
});

describe("principal resolution", () => {
    it("derives every field from the row, and the organization from the installation", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");

        const res = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId,
            clientSecret: issued.clientSecret,
        });

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const p: ApplicationPrincipal = res.principal;

        expect(p.kind).toBe("application");
        expect(p.orgId).toBe(ORG_A);
        expect(p.installationId).toBe("inst-a");
        expect(p.applicationSlug).toBe("attendance-partner");
        expect(p.producerKey).toBe("partner:org-a");
        expect(p.grantedScopes).toEqual(["attendance.write", "children.read"]);
        expect(p.boundary).toEqual({ mode: "locations", locationIds: [LOC_A1] });
    });

    it("is not a human identity and carries nowhere to put one", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");
        const res = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId,
            clientSecret: issued.clientSecret,
        });
        if (!res.ok) throw new Error("expected success");

        const keys = Object.keys(res.principal);
        // A principal that could supply any of these would eventually satisfy a
        // check written for an operator.
        for (const forbidden of ["userId", "user_id", "role", "roleKeys", "personId", "staffId", "permissionKeys"]) {
            expect(keys).not.toContain(forbidden);
        }
        expect(res.principal.kind).toBe("application");
    });

    it("refuses a malformed credential without touching the database", async () => {
        const fake = createFakeSupabase(seed());
        const res = await resolveApplicationPrincipal(fake.client, { clientId: "", clientSecret: "" });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.refusal).toBe("invalid_credential");
        expect(res.auditReason).toBe("malformed_credential");
    });

    it("refuses an unknown secret", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");
        const res = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId,
            clientSecret: "alloy_sk_not-a-real-secret",
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.refusal).toBe("invalid_credential");
    });

    it("gives the same coarse refusal for unknown and revoked, so a probe learns nothing", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");
        const credId = fake.rows("app_credentials")[0].id as string;

        const unknown = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId,
            clientSecret: "alloy_sk_never-existed",
        });

        await revokeCredential(fake.client, { credentialId: credId });
        const revoked = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId,
            clientSecret: issued.clientSecret,
        });

        expect(unknown.ok).toBe(false);
        expect(revoked.ok).toBe(false);
        if (unknown.ok || revoked.ok) return;
        // Identical on the wire...
        expect(revoked.refusal).toBe(unknown.refusal);
        // ...and distinguishable only in the audit, which the tenant owns.
        expect(revoked.auditReason).toBe("credential_revoked");
        expect(unknown.auditReason).toBe("unknown_credential");
    });
});

describe("tenant isolation — the central invariant", () => {
    it("resolves each credential to its own organization", async () => {
        const fake = createFakeSupabase(seed());
        const a = await issueFor(fake, "inst-a");
        const b = await issueFor(fake, "inst-b");

        const ra = await resolveApplicationPrincipal(fake.client, { clientId: a.clientId, clientSecret: a.clientSecret });
        const rb = await resolveApplicationPrincipal(fake.client, { clientId: b.clientId, clientSecret: b.clientSecret });

        expect(ra.ok && ra.principal.orgId).toBe(ORG_A);
        expect(rb.ok && rb.principal.orgId).toBe(ORG_B);
    });

    it("offers no way for a caller to name an organization", async () => {
        const fake = createFakeSupabase(seed());
        const a = await issueFor(fake, "inst-a");

        // The resolver's signature accepts a credential and nothing else. This
        // is the structural proof: there is no org parameter to override, so
        // SEC-0c's shape (a body-supplied org_id preferred over the row's) is
        // not expressible here.
        expect(resolveApplicationPrincipal.length).toBeLessThanOrEqual(3);

        const res = await resolveApplicationPrincipal(fake.client, {
            clientId: a.clientId,
            clientSecret: a.clientSecret,
            // @ts-expect-error — proving the extra field is not read
            orgId: ORG_B,
            org_id: ORG_B,
        });
        expect(res.ok && res.principal.orgId).toBe(ORG_A);
    });

    it("refuses org A's client_id paired with org B's secret", async () => {
        const fake = createFakeSupabase(seed());
        const a = await issueFor(fake, "inst-a");
        const b = await issueFor(fake, "inst-b");

        const res = await resolveApplicationPrincipal(fake.client, {
            clientId: a.clientId,
            clientSecret: b.clientSecret,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.auditReason).toBe("unknown_credential");
    });

    it("refuses a credential whose installation has vanished", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");
        fake.db.app_installations = fake.db.app_installations.filter((r) => r.id !== "inst-a");

        const res = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId,
            clientSecret: issued.clientSecret,
        });
        expect(res.ok).toBe(false);
    });
});

describe("installation state", () => {
    it("refuses a suspended installation, and says so only after the secret verifies", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");
        fake.db.app_installations[0].status = "suspended";

        const res = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId,
            clientSecret: issued.clientSecret,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.refusal).toBe("installation_suspended");
            expect(res.orgId).toBe(ORG_A);
        }
    });

    it("refuses a revoked installation", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");
        fake.db.app_installations[0].status = "revoked";
        const res = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId,
            clientSecret: issued.clientSecret,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.refusal).toBe("installation_revoked");
    });

    it("refuses a disabled application even where the installation is fine", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");
        fake.db.developer_applications[0].status = "disabled";
        const res = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId,
            clientSecret: issued.clientSecret,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.refusal).toBe("application_disabled");
    });
});

describe("rotation and revocation", () => {
    it("keeps the outgoing secret working until the overlap lapses, then stops", async () => {
        const fake = createFakeSupabase(seed());
        const first = await issueFor(fake, "inst-a");
        const credId = fake.rows("app_credentials")[0].id as string;

        const overlapUntil = new Date(Date.now() + 60_000).toISOString();
        const rotated = await rotateCredential(fake.client, { credentialId: credId, overlapUntil });
        expect(rotated.ok).toBe(true);
        if (!rotated.ok) return;

        // Both work during the overlap.
        const newOk = await resolveApplicationPrincipal(fake.client, {
            clientId: first.clientId, clientSecret: rotated.issued.clientSecret,
        });
        const oldOk = await resolveApplicationPrincipal(fake.client, {
            clientId: first.clientId, clientSecret: first.clientSecret,
        });
        expect(newOk.ok).toBe(true);
        expect(oldOk.ok).toBe(true);

        // After the deadline the outgoing one is as dead as a revocation...
        const later = new Date(Date.now() + 120_000);
        const oldLater = await resolveApplicationPrincipal(
            fake.client, { clientId: first.clientId, clientSecret: first.clientSecret }, later,
        );
        expect(oldLater.ok).toBe(false);
        if (!oldLater.ok) expect(oldLater.auditReason).toBe("secondary_secret_expired");

        // ...while the new one keeps working.
        const newLater = await resolveApplicationPrincipal(
            fake.client, { clientId: first.clientId, clientSecret: rotated.issued.clientSecret }, later,
        );
        expect(newLater.ok).toBe(true);
    });

    it("revocation kills both secrets in one act", async () => {
        const fake = createFakeSupabase(seed());
        const first = await issueFor(fake, "inst-a");
        const credId = fake.rows("app_credentials")[0].id as string;
        const rotated = await rotateCredential(fake.client, {
            credentialId: credId, overlapUntil: new Date(Date.now() + 60_000).toISOString(),
        });
        if (!rotated.ok) throw new Error("rotate failed");

        await revokeCredential(fake.client, { credentialId: credId });

        for (const secret of [first.clientSecret, rotated.issued.clientSecret]) {
            const res = await resolveApplicationPrincipal(fake.client, { clientId: first.clientId, clientSecret: secret });
            expect(res.ok).toBe(false);
        }
        // The overlap slot is cleared, not merely ignored.
        expect(fake.rows("app_credentials")[0].secret_hash_secondary).toBeNull();
    });

    it("revocation is effective on the next resolution, with no cache to wait out", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");
        const credId = fake.rows("app_credentials")[0].id as string;

        const before = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId, clientSecret: issued.clientSecret,
        });
        expect(before.ok).toBe(true);

        await revokeCredential(fake.client, { credentialId: credId });

        const after = await resolveApplicationPrincipal(fake.client, {
            clientId: issued.clientId, clientSecret: issued.clientSecret,
        });
        expect(after.ok).toBe(false);
    });
});

describe("scope enforcement", () => {
    const principal = (over: Partial<ApplicationPrincipal> = {}): ApplicationPrincipal =>
        ({
            kind: "application", applicationId: "app-1", applicationSlug: "s",
            ownershipMode: "partner_managed", environment: "production",
            installationId: "inst-a", orgId: ORG_A, producerKey: "p",
            credentialId: "c", clientId: "ci",
            grantedScopes: ["attendance.write"],
            boundary: { mode: "locations", locationIds: [LOC_A1] },
            ...over,
        }) as ApplicationPrincipal;

    it("allows a granted scope and denies a missing one", () => {
        expect(hasScope(principal(), "attendance.write")).toBe(true);
        expect(hasScope(principal(), "attendance.read")).toBe(false);
        expect(assertScope(principal(), "attendance.read")).toMatchObject({ ok: false, code: "forbidden_scope" });
    });

    it("does not treat a prefix as a grant", () => {
        // `attendance` implying `attendance.write` would make granting a read
        // quietly grant a write.
        expect(hasScope(principal({ grantedScopes: ["attendance"] }), "attendance.write")).toBe(false);
        expect(hasScope(principal({ grantedScopes: ["attendance.write.extra"] }), "attendance.write")).toBe(false);
    });

    it("denies everything when no scope is granted", () => {
        expect(hasScope(principal({ grantedScopes: [] }), "attendance.write")).toBe(false);
    });
});

describe("resource boundary enforcement", () => {
    const bounded: ApplicationPrincipal = {
        kind: "application", applicationId: "app-1", applicationSlug: "s",
        ownershipMode: "partner_managed", environment: "production",
        installationId: "inst-a", orgId: ORG_A, producerKey: "p",
        credentialId: "c", clientId: "ci", grantedScopes: [],
        boundary: { mode: "locations", locationIds: [LOC_A1] },
    };
    const orgWide: ApplicationPrincipal = { ...bounded, boundary: { mode: "org_wide" } };
    const empty: ApplicationPrincipal = { ...bounded, boundary: { mode: "locations", locationIds: [] } };

    it("allows a held location and denies another", () => {
        expect(locationAllowed(bounded, LOC_A1)).toBe(true);
        expect(locationAllowed(bounded, LOC_A2)).toBe(false);
        expect(assertLocation(bounded, LOC_A2)).toMatchObject({ ok: false, code: "forbidden_resource" });
    });

    it("treats an empty boundary as nothing, never as everything", () => {
        expect(locationAllowed(empty, LOC_A1)).toBe(false);
        expect(narrowLocations(empty, [LOC_A1])).toEqual([]);
        expect(narrowLocations(empty, [])).toEqual([]);
    });

    it("lets an org-wide installation act anywhere in its own organization", () => {
        expect(locationAllowed(orgWide, LOC_A2)).toBe(true);
    });

    it("narrows a caller's request and never widens it", () => {
        // Asking for one held and one unheld yields only the held one.
        expect(narrowLocations(bounded, [LOC_A1, LOC_A2])).toEqual([LOC_A1]);
        // Asking for nothing yields what is held, not everything.
        expect(narrowLocations(bounded, [])).toEqual([LOC_A1]);
        // A resource id is a request, never a permission.
        expect(narrowLocations(bounded, [LOC_A2])).toEqual([]);
    });
});

describe("security audit", () => {
    it("persists a durable row that contains no secret material", async () => {
        const fake = createFakeSupabase(seed());
        const issued = await issueFor(fake, "inst-a");

        await recordSecurityAudit(fake.client, {
            eventType: "authentication.succeeded",
            outcome: "allowed",
            orgId: ORG_A,
            installationId: "inst-a",
            credentialId: "cred-1",
            reasonCode: null,
            metadata: { label: "test" },
        });

        const rows = fake.rows("app_security_audit");
        expect(rows).toHaveLength(1);

        const serialized = JSON.stringify(rows[0]);
        expect(serialized).not.toContain(issued.clientSecret);
        expect(serialized).not.toContain(hashCredentialSecret(issued.clientSecret));
        expect(rows[0].org_id).toBe(ORG_A);
        expect(rows[0].event_type).toBe("authentication.succeeded");
    });

    it("drops metadata keys that are not allowlisted", async () => {
        const fake = createFakeSupabase(seed());
        await recordSecurityAudit(fake.client, {
            eventType: "authentication.rejected",
            outcome: "denied",
            metadata: {
                label: "kept",
                // A denylist would have to anticipate each of these.
                authorization: "Bearer super-secret",
                child_name: "should never appear",
                client_secret: "alloy_sk_leak",
            } as Record<string, string>,
        });

        const meta = fake.rows("app_security_audit")[0].metadata as Record<string, unknown>;
        expect(meta).toEqual({ label: "kept" });
    });

    it("records an unattributed rejection with a null organization", async () => {
        const fake = createFakeSupabase(seed());
        await recordSecurityAudit(fake.client, {
            eventType: "authentication.rejected",
            outcome: "denied",
            reasonCode: "unknown_credential",
        });
        const row = fake.rows("app_security_audit")[0];
        // Honest: a rejected unknown credential resolves no tenant. RLS makes
        // such a row invisible to every session rather than showing it to one.
        expect(row.org_id).toBeNull();
        expect(row.reason_code).toBe("unknown_credential");
    });
});

/**
 * Slice B.5 Gate 1 — the converged integration model.
 *
 * Proves the generic platform can express what the Attendance producer registry
 * expressed, without Attendance keeping a second credential, a second boundary
 * or a second correlation table.
 */

import { describe, expect, it, beforeEach } from "vitest";

import { createFakeSupabase, type Tables } from "../principal/fakeSupabase";
import { resolveIntegrationResourceRef } from "@/lib/platform/external/integrationResourceRefs";
import { attendanceAuthorityForPrincipal } from "@/lib/platform/principal/attendanceAuthorityAdapter";
import { internalPermissionsForScopes, PUBLIC_SCOPES } from "@/lib/platform/external/scopeCatalog";
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";

const ORG_A = "org-a";
const ORG_B = "org-b";
const SITE_A1 = "11111111-1111-4111-8111-111111111111";
const UNIT_A1_1 = "22222222-2222-4222-8222-222222222222";
const SITE_A2 = "33333333-3333-4333-8333-333333333333";

let fake: ReturnType<typeof createFakeSupabase>;

function seed(): Tables {
    const t = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString();
    return {
        locations: [
            { id: SITE_A1, org_id: ORG_A, location_type: "site", unit_role: null, label: "Downtown",
              parent_location_id: null, is_active: true, timezone: null, updated_at: t(1) },
            { id: UNIT_A1_1, org_id: ORG_A, location_type: "unit", unit_role: "operational_group", label: "Toddler 1",
              parent_location_id: SITE_A1, is_active: true, timezone: null, updated_at: t(2) },
            { id: SITE_A2, org_id: ORG_A, location_type: "site", unit_role: null, label: "Riverside",
              parent_location_id: null, is_active: true, timezone: null, updated_at: t(3) },
        ],
        integration_resource_refs: [
            { id: "ref-1", installation_id: "inst-1", org_id: ORG_A, resource_type: "child",
              external_id: "cc-child-9", child_customer_member_id: "cm-9", location_id: null, status: "active" },
            { id: "ref-2", installation_id: "inst-1", org_id: ORG_A, resource_type: "location",
              external_id: "cc-room-4", child_customer_member_id: null, location_id: UNIT_A1_1, status: "active" },
            { id: "ref-3", installation_id: "inst-1", org_id: ORG_A, resource_type: "child",
              external_id: "cc-child-disabled", child_customer_member_id: "cm-x", location_id: null, status: "disabled" },
            // Another installation using the SAME external id for a different child.
            { id: "ref-4", installation_id: "inst-2", org_id: ORG_A, resource_type: "child",
              external_id: "cc-child-9", child_customer_member_id: "cm-77", location_id: null, status: "active" },
        ],
    };
}

beforeEach(() => { fake = createFakeSupabase(seed()); });

function principal(over: Partial<ApplicationPrincipal> = {}): ApplicationPrincipal {
    return {
        kind: "application", applicationId: "app-1", applicationSlug: "partner",
        ownershipMode: "partner_managed", environment: "production",
        installationId: "inst-1", orgId: ORG_A, producerKey: "partner:org-a",
        credentialId: "cred-1", clientId: "alloy_app_x",
        grantedScopes: ["attendance.write"],
        boundary: { mode: "locations", locationIds: [SITE_A1] },
        ...over,
    } as ApplicationPrincipal;
}

describe("integration_resource_refs — one owner for correlation", () => {
    it("resolves a mapped external id to the Alloy resource", async () => {
        const r = await resolveIntegrationResourceRef({
            supabase: fake.client, installationId: "inst-1", orgId: ORG_A,
            resourceType: "child", externalId: "cc-child-9",
        });
        expect(r).toEqual({ ok: true, resourceType: "child", alloyResourceId: "cm-9" });
    });

    it("keeps each installation's namespace separate", async () => {
        // The same external id, a different installation, a different child.
        const a = await resolveIntegrationResourceRef({
            supabase: fake.client, installationId: "inst-1", orgId: ORG_A,
            resourceType: "child", externalId: "cc-child-9",
        });
        const b = await resolveIntegrationResourceRef({
            supabase: fake.client, installationId: "inst-2", orgId: ORG_A,
            resourceType: "child", externalId: "cc-child-9",
        });
        expect(a.ok && a.alloyResourceId).toBe("cm-9");
        expect(b.ok && b.alloyResourceId).toBe("cm-77");
    });

    it("fails closed on an unmapped id, and never invents one", async () => {
        const r = await resolveIntegrationResourceRef({
            supabase: fake.client, installationId: "inst-1", orgId: ORG_A,
            resourceType: "child", externalId: "never-seen",
        });
        expect(r).toEqual({ ok: false, code: "not_mapped" });
    });

    it("does not resolve a disabled mapping", async () => {
        const r = await resolveIntegrationResourceRef({
            supabase: fake.client, installationId: "inst-1", orgId: ORG_A,
            resourceType: "child", externalId: "cc-child-disabled",
        });
        expect(r.ok).toBe(false);
    });

    it("refuses to guess when a mapping is ambiguous", async () => {
        // The database forbids this with a partial unique index. The resolver
        // refuses anyway, so dropping that constraint could never silently turn
        // an ambiguity into a wrong subject.
        fake.db.integration_resource_refs.push({
            id: "ref-dup", installation_id: "inst-1", org_id: ORG_A, resource_type: "child",
            external_id: "cc-child-9", child_customer_member_id: "cm-OTHER", location_id: null, status: "active",
        });
        const r = await resolveIntegrationResourceRef({
            supabase: fake.client, installationId: "inst-1", orgId: ORG_A,
            resourceType: "child", externalId: "cc-child-9",
        });
        expect(r).toEqual({ ok: false, code: "ambiguous" });
    });

    it("refuses a cross-organization lookup", async () => {
        const r = await resolveIntegrationResourceRef({
            supabase: fake.client, installationId: "inst-1", orgId: ORG_B,
            resourceType: "child", externalId: "cc-child-9",
        });
        expect(r.ok).toBe(false);
    });

    it("does not confuse resource types", async () => {
        const r = await resolveIntegrationResourceRef({
            supabase: fake.client, installationId: "inst-1", orgId: ORG_A,
            resourceType: "location", externalId: "cc-child-9",
        });
        expect(r.ok).toBe(false);
    });
});

describe("scope → internal permission mapping", () => {
    it("maps the public attendance scope to the internal permission the gate checks", () => {
        expect(internalPermissionsForScopes(["attendance.write"])).toEqual(["attendance.record"]);
    });

    it("gives a read scope no internal permission", () => {
        // Reads are authorized by the boundary and the query, not by a grant.
        expect(internalPermissionsForScopes(["locations.read"])).toEqual([]);
    });

    it("grants nothing for a scope the catalog does not define", () => {
        // A stray string in an installation row must never become authority.
        expect(internalPermissionsForScopes(["attendance.record"])).toEqual([]);
        expect(internalPermissionsForScopes(["totally.made.up"])).toEqual([]);
    });

    it("keeps the two vocabularies distinct", () => {
        // The internal key is not itself a public scope.
        expect(Object.keys(PUBLIC_SCOPES)).not.toContain("attendance.record");
    });
});

describe("principal → attendance authority", () => {
    it("derives site authority from the installation boundary", async () => {
        const r = await attendanceAuthorityForPrincipal(fake.client, principal());
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.authority.producerKey).toBe("partner:org-a");
        expect([...r.authority.allowedSiteLocationIds]).toEqual([SITE_A1]);
        expect([...r.authority.grantedPermissionKeys]).toEqual(["attendance.record"]);
    });

    it("a site boundary carries its units' site, not the sibling site", async () => {
        const r = await attendanceAuthorityForPrincipal(fake.client, principal());
        if (!r.ok) throw new Error("expected authority");
        expect([...r.authority.allowedSiteLocationIds]).not.toContain(SITE_A2);
    });

    it("an org-wide installation reaches every site in its organization", async () => {
        const r = await attendanceAuthorityForPrincipal(
            fake.client, principal({ boundary: { mode: "org_wide" } }),
        );
        if (!r.ok) throw new Error("expected authority");
        expect([...r.authority.allowedSiteLocationIds].sort()).toEqual([SITE_A1, SITE_A2].sort());
    });

    it("an empty restricted boundary yields no authority at all", async () => {
        const r = await attendanceAuthorityForPrincipal(
            fake.client, principal({ boundary: { mode: "locations", locationIds: [] } }),
        );
        expect(r).toEqual({ ok: false, code: "no_sites_in_boundary" });
    });

    it("cannot exceed what the same installation could read", async () => {
        // The adapter uses the same boundary-enforced query as GET /api/v1/locations,
        // so attendance authority can never reach a site the read surface hides.
        const scoped = await attendanceAuthorityForPrincipal(fake.client, principal());
        const other = await attendanceAuthorityForPrincipal(
            fake.client, principal({ boundary: { mode: "locations", locationIds: [SITE_A2] } }),
        );
        if (!scoped.ok || !other.ok) throw new Error("expected both");
        expect([...scoped.authority.allowedSiteLocationIds]).toEqual([SITE_A1]);
        expect([...other.authority.allowedSiteLocationIds]).toEqual([SITE_A2]);
    });

    it("grants no attendance permission without the public scope", async () => {
        const r = await attendanceAuthorityForPrincipal(
            fake.client, principal({ grantedScopes: ["locations.read"] }),
        );
        if (!r.ok) throw new Error("expected authority");
        // The attendance gate will then deny: it requires attendance.record.
        expect([...r.authority.grantedPermissionKeys]).toEqual([]);
    });

    it("does not read authority from another organization", async () => {
        const r = await attendanceAuthorityForPrincipal(
            fake.client, principal({ orgId: ORG_B, boundary: { mode: "org_wide" } }),
        );
        expect(r).toEqual({ ok: false, code: "no_sites_in_boundary" });
    });
});

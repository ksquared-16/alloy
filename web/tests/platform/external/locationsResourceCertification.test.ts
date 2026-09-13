/**
 * Slice B.3 certification — the first canonical resource, proven from the
 * refusals inward.
 *
 * Topology under test, exactly as Part 18 requires:
 *
 *   Org A ── Site A1 ── Unit A1-1 (operational_group)
 *        └── Site A2
 *   Org B ── Site B1
 *
 *   Installation 1 → Org A, org_wide
 *   Installation 2 → Org A, restricted to Site A1
 *   Installation 3 → Org B
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Tables } from "../principal/fakeSupabase";

const ORG_A = "org-a";
const ORG_B = "org-b";
const SITE_A1 = "11111111-1111-4111-8111-111111111111";
const UNIT_A1_1 = "22222222-2222-4222-8222-222222222222";
const SITE_A2 = "33333333-3333-4333-8333-333333333333";
const SITE_B1 = "44444444-4444-4444-8444-444444444444";
const FAMILY_ADDRESS = "55555555-5555-4555-8555-555555555555";

let fake: ReturnType<typeof createFakeSupabase>;
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => fake.client }));

const { GET: locationsRoute } = await import("@/app/api/v1/locations/route");
const { POST: tokenRoute } = await import("@/app/api/v1/oauth/token/route");
const { issueCredential } = await import("@/lib/platform/principal/applicationCredential");

function seed(): Tables {
    const t = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString();
    return {
        developer_applications: [
            { id: "app-1", slug: "partner", ownership_mode: "partner_managed", environment: "production", status: "active" },
        ],
        app_installations: [
            { id: "inst-1", application_id: "app-1", org_id: ORG_A, granted_scopes: ["locations.read"],
              boundary_mode: "org_wide", location_boundary: [], producer_key: "p1", status: "active" },
            { id: "inst-2", application_id: "app-1", org_id: ORG_A, granted_scopes: ["locations.read"],
              boundary_mode: "locations", location_boundary: [SITE_A1], producer_key: "p2", status: "active" },
            { id: "inst-3", application_id: "app-1", org_id: ORG_B, granted_scopes: ["locations.read"],
              boundary_mode: "org_wide", location_boundary: [], producer_key: "p3", status: "active" },
            { id: "inst-4", application_id: "app-1", org_id: ORG_A, granted_scopes: [],
              boundary_mode: "org_wide", location_boundary: [], producer_key: "p4", status: "active" },
            { id: "inst-5", application_id: "app-1", org_id: ORG_A, granted_scopes: ["locations.read"],
              boundary_mode: "locations", location_boundary: [], producer_key: "p5", status: "active" },
        ],
        app_credentials: [], app_access_tokens: [], app_security_audit: [], app_api_activity: [],
        locations: [
            { id: SITE_A1, org_id: ORG_A, location_type: "site", unit_role: null, label: "Downtown",
              parent_location_id: null, is_active: true, updated_at: t(1) },
            { id: UNIT_A1_1, org_id: ORG_A, location_type: "unit", unit_role: "operational_group", label: "Toddler 1",
              parent_location_id: SITE_A1, is_active: true, updated_at: t(2) },
            { id: SITE_A2, org_id: ORG_A, location_type: "site", unit_role: null, label: "Riverside",
              parent_location_id: null, is_active: true, updated_at: t(3) },
            { id: SITE_B1, org_id: ORG_B, location_type: "site", unit_role: null, label: "Other Tenant",
              parent_location_id: null, is_active: true, updated_at: t(4) },
            // A family's home. Same table, and never a public resource.
            { id: FAMILY_ADDRESS, org_id: ORG_A, location_type: "address", unit_role: null, label: "14 Elm St",
              parent_location_id: null, is_active: true, updated_at: t(5),
              address1: "14 Elm St", city: "Bend", postal_code: "97701", access_code: "4821",
              access_notes: "side gate", lat: 44.05, lng: -121.31, customer_id: "cust-1" },
        ],
    };
}

beforeEach(() => { fake = createFakeSupabase(seed()); });

async function tokenFor(installationId: string) {
    const c = await issueCredential(fake.client, { installationId, label: "t" });
    if (!c.ok) throw new Error(c.reason);
    const res = await tokenRoute(
        new NextRequest("https://alloy.test/api/v1/oauth/token", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", client_id: c.issued.clientId, client_secret: c.issued.clientSecret }),
        }),
    );
    return String(((await res.json()) as Record<string, unknown>).access_token);
}

async function listLocations(token: string | null, query = "") {
    const res = await locationsRoute(
        new NextRequest(`https://alloy.test/api/v1/locations${query}`, {
            method: "GET", headers: token ? { authorization: `Bearer ${token}` } : {},
        }),
    );
    return { res, body: (await res.json()) as { data?: { id: string }[]; next_cursor?: string | null; error?: Record<string, unknown> } };
}

const ids = (b: { data?: { id: string }[] }) => (b.data ?? []).map((r) => r.id).sort();

describe("org-wide installation", () => {
    it("reads its own organization's sites and units, and nothing of another tenant", async () => {
        const { res, body } = await listLocations(await tokenFor("inst-1"));
        expect(res.status).toBe(200);
        expect(ids(body)).toEqual([SITE_A1, UNIT_A1_1, SITE_A2].sort());
        expect(ids(body)).not.toContain(SITE_B1);
    });

    it("never returns customer premises at any scope", async () => {
        const { body } = await listLocations(await tokenFor("inst-1"));
        expect(ids(body)).not.toContain(FAMILY_ADDRESS);

        // The door code, the street and the coordinates are not merely filtered
        // from a field list — they are never selected.
        const serialized = JSON.stringify(body);
        for (const leak of ["4821", "14 Elm St", "97701", "side gate", "44.05"]) {
            expect(serialized).not.toContain(leak);
        }
    });
});

describe("restricted installation", () => {
    it("sees its site and the units under it, and not the sibling site", async () => {
        const { body } = await listLocations(await tokenFor("inst-2"));
        expect(ids(body)).toEqual([SITE_A1, UNIT_A1_1].sort());
        expect(ids(body)).not.toContain(SITE_A2);
        expect(ids(body)).not.toContain(SITE_B1);
    });

    it("an empty restricted boundary returns nothing — never everything", async () => {
        const { res, body } = await listLocations(await tokenFor("inst-5"));
        expect(res.status).toBe(200);
        expect(body.data).toEqual([]);
        expect(body.next_cursor).toBeNull();
    });

    it("cannot reach outside the boundary by naming a location", async () => {
        const token = await tokenFor("inst-2");
        // Site A2 is in the same organization and still refused.
        expect(ids(await listLocations(token, `?location_id=${SITE_A2}`).then((r) => r.body))).toEqual([]);
        // Another tenant's site returns nothing rather than confirming it exists.
        expect(ids(await listLocations(token, `?location_id=${SITE_B1}`).then((r) => r.body))).toEqual([]);
    });
});

describe("cross-tenant isolation", () => {
    it("org B sees only org B", async () => {
        const { body } = await listLocations(await tokenFor("inst-3"));
        expect(ids(body)).toEqual([SITE_B1]);
    });

    it("ignores every spoofed identifier a caller can send", async () => {
        const token = await tokenFor("inst-2");
        const res = await locationsRoute(
            new NextRequest(
                `https://alloy.test/api/v1/locations?org_id=${ORG_B}&organization_id=${ORG_B}&installation_id=inst-1&application_id=app-1`,
                { method: "GET", headers: { authorization: `Bearer ${token}`, "x-org-id": ORG_B, "x-installation-id": "inst-1" } },
            ),
        );
        const body = (await res.json()) as { data: { id: string }[] };
        expect(res.status).toBe(200);
        // Still installation 2's authority: Site A1 and its unit.
        expect(body.data.map((r) => r.id).sort()).toEqual([SITE_A1, UNIT_A1_1].sort());
    });
});

describe("scope enforcement", () => {
    it("refuses a valid token without locations.read", async () => {
        const { res, body } = await listLocations(await tokenFor("inst-4"));
        expect(res.status).toBe(403);
        expect(body.error?.code).toBe("forbidden_scope");
        expect(body.error?.type).toBe("forbidden_scope");
    });

    it("a similarly named scope does not satisfy locations.read", async () => {
        for (const near of [["locations"], ["locations.readwrite"], ["locations.read.all"], ["LOCATIONS.READ"]]) {
            fake.db.app_installations[3].granted_scopes = near;
            const { res } = await listLocations(await tokenFor("inst-4"));
            expect(res.status, `scope ${near[0]} must not satisfy locations.read`).toBe(403);
        }
    });

    it("refuses an unauthenticated request", async () => {
        const { res } = await listLocations(null);
        expect(res.status).toBe(401);
    });
});

describe("collection contract", () => {
    it("paginates deterministically and stops without an extra request", async () => {
        const token = await tokenFor("inst-1");
        const first = await listLocations(token, "?limit=2");
        expect(first.body.data).toHaveLength(2);
        expect(first.body.next_cursor).toBeTruthy();

        const second = await listLocations(token, `?limit=2&cursor=${encodeURIComponent(first.body.next_cursor!)}`);
        expect(second.body.data).toHaveLength(1);
        // The last page reports no cursor, so a client never asks for nothing.
        expect(second.body.next_cursor).toBeNull();

        const seen = [...first.body.data!, ...second.body.data!].map((r) => r.id);
        expect(new Set(seen).size).toBe(3);
    });

    it("a cursor is a position, never a permission", async () => {
        // Page as the org-wide installation, then replay its cursor as the
        // restricted one. The boundary is applied inside the query, so a cursor
        // from a wider view cannot widen a narrower one.
        const wide = await listLocations(await tokenFor("inst-1"), "?limit=1");
        const cursor = wide.body.next_cursor!;
        const narrow = await listLocations(await tokenFor("inst-2"), `?limit=50&cursor=${encodeURIComponent(cursor)}`);

        for (const row of narrow.body.data ?? []) {
            expect([SITE_A1, UNIT_A1_1]).toContain(row.id);
        }
    });

    it("refuses a malformed cursor rather than silently restarting", async () => {
        const { res, body } = await listLocations(await tokenFor("inst-1"), "?cursor=not-a-cursor");
        expect(res.status).toBe(400);
        expect(body.error?.code).toBe("invalid_cursor");
    });

    it("refuses a nonsense limit and clamps an oversized one", async () => {
        const token = await tokenFor("inst-1");
        expect((await listLocations(token, "?limit=abc")).res.status).toBe(400);
        expect((await listLocations(token, "?limit=0")).res.status).toBe(400);
        // 5000 is clamped to the maximum rather than refused.
        expect((await listLocations(token, "?limit=5000")).res.status).toBe(200);
    });

    it("returns an empty page as data:[] with a null cursor", async () => {
        const { body } = await listLocations(await tokenFor("inst-2"), `?type=site&parent_id=${UNIT_A1_1}`);
        expect(body.data).toEqual([]);
        expect(body.next_cursor).toBeNull();
    });
});

describe("filters narrow, never expand", () => {
    it("type and parent_id reduce the authorized set", async () => {
        const token = await tokenFor("inst-1");
        expect(ids(await listLocations(token, "?type=site").then((r) => r.body))).toEqual([SITE_A1, SITE_A2].sort());
        expect(ids(await listLocations(token, `?parent_id=${SITE_A1}`).then((r) => r.body))).toEqual([UNIT_A1_1]);
    });

    it("rejects a filter that is not a valid shape", async () => {
        const token = await tokenFor("inst-1");
        expect((await listLocations(token, "?type=address")).res.status).toBe(400);
        expect((await listLocations(token, "?location_id=not-a-uuid")).res.status).toBe(400);
    });
});

describe("public representation", () => {
    it("exposes the agreed fields and no internal column", async () => {
        const { body } = await listLocations(await tokenFor("inst-2"), `?location_id=${UNIT_A1_1}`);
        const row = body.data![0] as unknown as Record<string, unknown>;

        expect(Object.keys(row).sort()).toEqual(
            ["active", "id", "name", "parent_id", "site_id", "type", "unit_role", "updated_at"].sort(),
        );
        expect(row.type).toBe("unit");
        expect(row.unit_role).toBe("operational_group");
        // The site-resolution authority answered, not a guess.
        expect(row.site_id).toBe(SITE_A1);
        // org_id is deliberately absent: /context already names the organization.
        expect(row).not.toHaveProperty("org_id");
        for (const internal of ["metadata", "access_code", "address1", "lat", "customer_id", "external_id", "status_key"]) {
            expect(row).not.toHaveProperty(internal);
        }
    });

    it("keeps the Alloy id canonical and introduces no provider alias", async () => {
        const { body } = await listLocations(await tokenFor("inst-2"), `?location_id=${SITE_A1}`);
        const row = body.data![0] as unknown as Record<string, unknown>;
        expect(row.id).toBe(SITE_A1);
        for (const alias of ["external_id", "external_location_id", "provider_id", "source_id"]) {
            expect(row).not.toHaveProperty(alias);
        }
    });
});

describe("API activity", () => {
    it("records the operation without persisting any location payload", async () => {
        await listLocations(await tokenFor("inst-1"));
        const rows = fake.rows("app_api_activity").filter((r) => r.route === "/api/v1/locations");
        expect(rows.length).toBeGreaterThan(0);

        const row = rows[rows.length - 1];
        expect(row.operation_id).toBe("listLocations");
        expect(row.org_id).toBe(ORG_A);
        expect(row.installation_id).toBe("inst-1");
        expect(row.outcome).toBe("success");
        expect(String(row.request_id)).toMatch(/^req_/);
        expect(typeof row.latency_ms).toBe("number");

        // Convenience is not a reason to log a tenant's data.
        const serialized = JSON.stringify(rows);
        for (const payload of ["Downtown", "Toddler 1", "Riverside"]) {
            expect(serialized).not.toContain(payload);
        }
    });

    it("records a refusal with its error code", async () => {
        await listLocations(await tokenFor("inst-4"));
        const rows = fake.rows("app_api_activity").filter((r) => r.route === "/api/v1/locations");
        expect(rows.some((r) => r.error_code === "forbidden_scope" && r.outcome === "client_error")).toBe(true);
    });
});

/**
 * Attendance authorization — capability AND reach.
 *
 * The defect being closed: no attendance capability existed, the route's gate
 * checked no role, and the handler used a service-role client that bypasses RLS.
 * So the tests that matter most here are the DENIALS — and specifically that a
 * failed lookup denies rather than degrading into an allow.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    ATTENDANCE_READ_PERMISSION_KEY,
    ATTENDANCE_RECORD_PERMISSION_KEY,
    assertAttendanceCaptureAllowed,
    assertAttendanceLocationsInScope,
    assertAttendanceReadAllowed,
    assertNonHumanCaptureAllowed,
    narrowSitesToScope,
} from "@/lib/childcareOperational/attendance/attendancePermissions";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

const ORG = "org-1";
const SITE_A = "site-a";
const SITE_B = "site-b";
const ROOM_A = "room-a";
const ROOM_B = "room-b";

const ALL_SITES: AdminAccessScopeDimensions = {
    departmentScope: "all",
    allowedDepartmentIds: [],
    siteScope: "all",
    allowedSiteLocationIds: [],
};
const ONLY_SITE_A: AdminAccessScopeDimensions = {
    departmentScope: "all",
    allowedDepartmentIds: [],
    siteScope: "restricted",
    allowedSiteLocationIds: [SITE_A],
};

/**
 * Minimal locations graph so the real ancestor-walking scope helper runs against
 * something. Rooms hang off their sites; sites root themselves.
 */
const LOCATIONS: Record<string, { location_type: string; parent_location_id: string | null }> = {
    [SITE_A]: { location_type: "site", parent_location_id: null },
    [SITE_B]: { location_type: "site", parent_location_id: null },
    [ROOM_A]: { location_type: "unit", parent_location_id: SITE_A },
    [ROOM_B]: { location_type: "unit", parent_location_id: SITE_B },
};

/** Supabase stub: user_roles + role_permission_grants + locations. */
function supa(opts: { roles?: string[]; grants?: Record<string, string[]>; failGrants?: boolean }) {
    const roles = opts.roles ?? ["admin"];
    const grants = opts.grants ?? { admin: [ATTENDANCE_RECORD_PERMISSION_KEY, ATTENDANCE_READ_PERMISSION_KEY] };

    const from = vi.fn((table: string) => {
        if (table === "user_roles") {
            return chain(roles.map((role) => ({ org_id: ORG, role })), opts.failGrants === true);
        }
        if (table === "role_permission_grants") {
            const rows = roles.flatMap((role) =>
                (grants[role] ?? []).map((permission_key) => ({ org_id: ORG, role_key: role, permission_key, allowed: true })),
            );
            return chain(rows, opts.failGrants === true);
        }
        if (table === "locations") return locationChain();
        return chain([], false);
    });

    return { from } as unknown as SupabaseClient;
}

function chain(rows: unknown[], fail: boolean) {
    const result = fail ? { data: null, error: { message: "boom" } } : { data: rows, error: null };
    const api: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "not", "order", "limit"]) {
        api[m] = () => api;
    }
    api.maybeSingle = async () => (fail ? { data: null, error: { message: "boom" } } : { data: rows[0] ?? null, error: null });
    api.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return api;
}

function locationChain() {
    let wanted: string | null = null;
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = (col: string, val: string) => {
        if (col === "id") wanted = val;
        return api;
    };
    api.maybeSingle = async () => {
        const row = wanted ? LOCATIONS[wanted] : null;
        return { data: row ? { id: wanted, ...row } : null, error: null };
    };
    return api;
}

describe("capability", () => {
    it("allows an admin holding attendance.record", async () => {
        const v = await assertAttendanceCaptureAllowed({
            supabase: supa({}),
            orgId: ORG,
            userId: "u1",
            dim: ALL_SITES,
            siteLocationId: SITE_A,
        });
        expect(v.ok).toBe(true);
    });

    it("refuses an authenticated role WITHOUT the capability", async () => {
        const v = await assertAttendanceCaptureAllowed({
            supabase: supa({ roles: ["viewer"], grants: { viewer: ["billing.read"] } }),
            orgId: ORG,
            userId: "u1",
            dim: ALL_SITES,
            siteLocationId: SITE_A,
        });
        expect(v).toMatchObject({ ok: false, status: 403, code: "permission_denied" });
    });

    it("refuses an unidentified caller — no user id is not an unprivileged user", async () => {
        const v = await assertAttendanceCaptureAllowed({
            supabase: supa({}),
            orgId: ORG,
            userId: null,
            dim: ALL_SITES,
            siteLocationId: SITE_A,
        });
        expect(v).toMatchObject({ ok: false, code: "permission_unresolved" });
    });

    it("DENIES when the grants lookup fails — a broken read is not an open door", async () => {
        const v = await assertAttendanceCaptureAllowed({
            supabase: supa({ failGrants: true }),
            orgId: ORG,
            userId: "u1",
            dim: ALL_SITES,
            siteLocationId: SITE_A,
        });
        expect(v).toMatchObject({ ok: false, code: "permission_unresolved" });
    });

    it("gates reads on the read capability", async () => {
        const denied = await assertAttendanceReadAllowed({
            supabase: supa({ roles: ["viewer"], grants: { viewer: [] } }),
            orgId: ORG,
            userId: "u1",
        });
        expect(denied).toMatchObject({ ok: false, code: "permission_denied" });
    });
});

describe("reach — site scope is asked independently of capability", () => {
    it("lets an org-wide caller capture anywhere", async () => {
        const v = await assertAttendanceLocationsInScope({
            supabase: supa({}),
            orgId: ORG,
            dim: ALL_SITES,
            siteLocationId: SITE_B,
            roomLocationIds: [ROOM_B],
        });
        expect(v.ok).toBe(true);
    });

    it("refuses a child at a site the caller does not hold", async () => {
        const v = await assertAttendanceLocationsInScope({
            supabase: supa({}),
            orgId: ORG,
            dim: ONLY_SITE_A,
            siteLocationId: SITE_B,
        });
        expect(v).toMatchObject({ ok: false, code: "site_out_of_scope" });
    });

    it("refuses a DESTINATION room at another site even when the child is in scope", async () => {
        // The subject is fine; the move would land them somewhere the caller
        // cannot see. Checking only the subject would miss this entirely.
        const v = await assertAttendanceLocationsInScope({
            supabase: supa({}),
            orgId: ORG,
            dim: ONLY_SITE_A,
            siteLocationId: SITE_A,
            roomLocationIds: [ROOM_A, ROOM_B],
        });
        expect(v).toMatchObject({ ok: false, code: "location_out_of_scope" });
    });

    it("refuses when the subject's site cannot be resolved", async () => {
        const v = await assertAttendanceLocationsInScope({
            supabase: supa({}),
            orgId: ORG,
            dim: ONLY_SITE_A,
            siteLocationId: null,
        });
        expect(v).toMatchObject({ ok: false, code: "site_unresolved" });
    });

    it("a capable caller is still refused out of scope", async () => {
        const v = await assertAttendanceCaptureAllowed({
            supabase: supa({}),
            orgId: ORG,
            userId: "u1",
            dim: ONLY_SITE_A,
            siteLocationId: SITE_B,
        });
        expect(v).toMatchObject({ ok: false, code: "site_out_of_scope" });
    });
});

describe("a site filter may only narrow", () => {
    it("passes an org-wide caller's request through", () => {
        expect(narrowSitesToScope(ALL_SITES, SITE_B)).toEqual({ siteLocationIds: [SITE_B] });
        expect(narrowSitesToScope(ALL_SITES, null)).toEqual({ siteLocationIds: null });
    });

    it("intersects a restricted caller's request rather than trusting it", () => {
        expect(narrowSitesToScope(ONLY_SITE_A, SITE_A)).toEqual({ siteLocationIds: [SITE_A] });
        // Asking for a site you do not hold yields NOTHING, never everything.
        expect(narrowSitesToScope(ONLY_SITE_A, SITE_B)).toEqual({ siteLocationIds: [] });
    });

    it("defaults a restricted caller to exactly their sites", () => {
        expect(narrowSitesToScope(ONLY_SITE_A, null)).toEqual({ siteLocationIds: [SITE_A] });
    });
});

describe("non-human producers have their own boundary", () => {
    it("denies an unregistered producer instead of inheriting a session", async () => {
        expect(await assertNonHumanCaptureAllowed({ authority: null, siteLocationId: SITE_A })).toMatchObject({
            ok: false,
            code: "producer_unregistered",
        });
    });

    it("denies a registered producer lacking the capability", async () => {
        const v = await assertNonHumanCaptureAllowed({
            authority: { producerKey: "kiosk-1", allowedSiteLocationIds: [SITE_A], grantedPermissionKeys: [] },
            siteLocationId: SITE_A,
        });
        expect(v).toMatchObject({ ok: false, code: "producer_permission_denied" });
    });

    it("denies a producer at a site it is not registered for", async () => {
        const v = await assertNonHumanCaptureAllowed({
            authority: {
                producerKey: "kiosk-1",
                allowedSiteLocationIds: [SITE_A],
                grantedPermissionKeys: [ATTENDANCE_RECORD_PERMISSION_KEY],
            },
            siteLocationId: SITE_B,
        });
        expect(v).toMatchObject({ ok: false, code: "producer_site_out_of_scope" });
    });

    it("allows a fully registered producer", async () => {
        const v = await assertNonHumanCaptureAllowed({
            authority: {
                producerKey: "kiosk-1",
                allowedSiteLocationIds: [SITE_A],
                grantedPermissionKeys: [ATTENDANCE_RECORD_PERMISSION_KEY],
            },
            siteLocationId: SITE_A,
        });
        expect(v.ok).toBe(true);
    });
});

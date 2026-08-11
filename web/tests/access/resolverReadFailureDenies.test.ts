import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    resolveAdminAccessCore,
    resolveAdminAccessDimensionsForOrgMember,
    scopeAnswerForFailedProfileRead,
    ABSENT_PROFILE_ENFORCEMENT,
} from "@/lib/admin/resolveAdminAccessCore";
import { resolveAdminPortalOrgCore } from "@/lib/admin/resolveAdminPortalOrgCore";

/**
 * W-43 (`I-30`ᴬ, `RL-23`) — every resolver read error denies. GAP-3's read-error leg.
 *
 * `F15` in the plan's fixture table: *"force each of the resolver reads to error in turn; assert
 * every case denies. One variant per resolver read."*
 *
 * The control that makes this suite non-vacuous is `ABSENT_PROFILE_ENFORCEMENT` itself. It is
 * pinned to `legacy-all` (it cannot flip until the M1 backfill is applied on the shared target, or
 * it locks out the 2 known profile-less principals). So under a HEALTHY read, an absent profile
 * resolves to `all` — which means every "restricted" assertion below can only have come from the
 * injected failure. If the error path were deleted, the fixture would resolve `all` and the
 * assertion would fail. The absent-profile control at the bottom asserts exactly that.
 */

const ORG = "org-1";
const USER = "user-1";

/** Chainable, awaitable stand-in for a PostgREST builder — covers eq/in/maybeSingle and await. */
function builder(data: unknown, error: { message: string } | null) {
    const b: Record<string, unknown> = {};
    b.eq = () => b;
    b.in = () => b;
    b.order = () => b;
    b.maybeSingle = () => Promise.resolve({ data, error });
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data, error }).then(res, rej);
    return b;
}

type Fixture = {
    user_roles?: { org_id: string; role: string }[];
    grants?: { permission_key: string }[];
    profile?: { department_scope: string; site_scope: string } | null;
    dept_access?: { department_id: string }[];
    site_access?: { location_id: string }[];
    legacy_profile_role?: string | null;
    app_users?: { role: string; org_id: string } | null;
};

/** `failTable` is the single injected fault — every other read succeeds. */
function mockSupabase(fixture: Fixture, failTable?: string): SupabaseClient {
    const fail = { message: `injected ${failTable} read failure` };
    const from = vi.fn((table: string) => ({
        select: (cols?: string) => {
            if (table === failTable) return builder(null, fail);
            switch (table) {
                case "user_roles":
                    return builder(fixture.user_roles ?? [], null);
                case "role_permission_grants":
                    return builder(fixture.grants ?? [], null);
                case "user_access_profiles":
                    return builder(fixture.profile ?? null, null);
                case "user_department_access":
                    return builder(fixture.dept_access ?? [], null);
                case "user_site_access":
                    return builder(fixture.site_access ?? [], null);
                case "user_profiles":
                    return builder(
                        fixture.legacy_profile_role ? { role: fixture.legacy_profile_role } : null,
                        null
                    );
                case "app_users": {
                    const row = fixture.app_users ?? null;
                    if (!row) return builder(null, null);
                    return builder(
                        cols && cols.includes("role") ? { role: row.role, org_id: row.org_id } : { org_id: row.org_id },
                        null
                    );
                }
                default:
                    return builder(null, null);
            }
        },
    }));
    return { from } as unknown as SupabaseClient;
}

/** A membership that is admitted and has NO profile row — resolves `all` while reads are healthy. */
const ADMITTED_NO_PROFILE: Fixture = {
    user_roles: [{ org_id: ORG, role: "admin" }],
    grants: [{ permission_key: "settings.users_roles" }],
    profile: null,
};

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
});

describe("W-43 — the enforcing resolver denies on every read failure (F15)", () => {
    it("control: with all reads healthy, an absent profile resolves `all` — so `restricted` below can only come from the fault", async () => {
        expect(ABSENT_PROFILE_ENFORCEMENT).toBe("legacy-all");
        const core = await resolveAdminAccessCore(mockSupabase(ADMITTED_NO_PROFILE), USER);
        expect(core).not.toBeNull();
        expect(core?.departmentScope).toBe("all");
        expect(core?.siteScope).toBe("all");
    });

    it("user_access_profiles error denies both scopes — the widest fail-open, closed", async () => {
        const core = await resolveAdminAccessCore(
            mockSupabase(ADMITTED_NO_PROFILE, "user_access_profiles"),
            USER
        );
        expect(core).not.toBeNull();
        expect(core?.departmentScope).toBe("restricted");
        expect(core?.siteScope).toBe("restricted");
        // Denial is `restricted` PLUS explicitly empty allow-lists — never `restricted` alone,
        // or a principal holding user_department_access rows grants itself what the failed read
        // was supposed to withhold.
        expect(core?.allowedDepartmentIds).toEqual([]);
        expect(core?.allowedSiteLocationIds).toEqual([]);
    });

    it("a failed profile read is NOT recorded in W-7's divergence window", async () => {
        await resolveAdminAccessCore(mockSupabase(ADMITTED_NO_PROFILE, "user_access_profiles"), USER);
        const divergence = warnSpy.mock.calls.flat().join(" ");
        expect(divergence).not.toContain("scope-divergence");
        expect(divergence).not.toContain("absent_profile_row");
        // It is recorded — on its own channel, with its own cause.
        const failures = errorSpy.mock.calls.flat().join(" ");
        expect(failures).toContain("[access-identity][W-43][read-failure]");
        expect(failures).toContain("table=user_access_profiles");
        expect(failures).toContain("outcome=deny");
    });

    it("role_permission_grants error denies the whole resolution, not just the permission set", async () => {
        const core = await resolveAdminAccessCore(
            mockSupabase(ADMITTED_NO_PROFILE, "role_permission_grants"),
            USER
        );
        // `[]` would have been indistinguishable from a role that holds no grants, and the
        // 131-of-132 surfaces gating on admission alone never look at permissionKeys.
        expect(core).toBeNull();
    });

    it("user_roles error denies", async () => {
        expect(await resolveAdminAccessCore(mockSupabase(ADMITTED_NO_PROFILE, "user_roles"), USER)).toBeNull();
    });

    it("user_department_access error yields an empty allow-list, not an absent one", async () => {
        const core = await resolveAdminAccessCore(
            mockSupabase(
                {
                    user_roles: [{ org_id: ORG, role: "admin" }],
                    grants: [{ permission_key: "settings.users_roles" }],
                    profile: { department_scope: "restricted", site_scope: "restricted" },
                },
                "user_department_access"
            ),
            USER
        );
        expect(core?.allowedDepartmentIds).toEqual([]);
    });

    it("user_site_access error yields an empty allow-list, not an absent one", async () => {
        const core = await resolveAdminAccessCore(
            mockSupabase(
                {
                    user_roles: [{ org_id: ORG, role: "admin" }],
                    grants: [{ permission_key: "settings.users_roles" }],
                    profile: { department_scope: "restricted", site_scope: "restricted" },
                },
                "user_site_access"
            ),
            USER
        );
        expect(core?.allowedSiteLocationIds).toEqual([]);
    });
});

describe("W-43 — the legacy admin/ops grant path denies on read failure", () => {
    const LEGACY: Fixture = {
        user_roles: [],
        legacy_profile_role: "admin",
        app_users: { role: "admin", org_id: ORG },
    };

    it("control: the legacy path does grant admin when its reads are healthy", async () => {
        const core = await resolveAdminAccessCore(mockSupabase(LEGACY), USER);
        expect(core?.orgId).toBe(ORG);
        expect(core?.roleKeys).toEqual(["admin"]);
    });

    it("user_profiles error denies the legacy grant", async () => {
        expect(await resolveAdminAccessCore(mockSupabase(LEGACY, "user_profiles"), USER)).toBeNull();
    });

    it("app_users error denies the legacy grant", async () => {
        expect(await resolveAdminAccessCore(mockSupabase(LEGACY, "app_users"), USER)).toBeNull();
    });
});

describe("W-43 — the preview resolver denies identically", () => {
    it("control: healthy reads, absent profile, resolves `all`", async () => {
        const d = await resolveAdminAccessDimensionsForOrgMember(mockSupabase(ADMITTED_NO_PROFILE), USER, ORG);
        expect(d?.departmentScope).toBe("all");
        expect(d?.siteScope).toBe("all");
    });

    it("user_access_profiles error denies — the preview must not render All locations when enforcement denies", async () => {
        const d = await resolveAdminAccessDimensionsForOrgMember(
            mockSupabase(ADMITTED_NO_PROFILE, "user_access_profiles"),
            USER,
            ORG
        );
        expect(d?.departmentScope).toBe("restricted");
        expect(d?.siteScope).toBe("restricted");
        expect(d?.allowedDepartmentIds).toEqual([]);
        expect(d?.allowedSiteLocationIds).toEqual([]);
    });

    it("role_permission_grants error denies the preview too", async () => {
        expect(
            await resolveAdminAccessDimensionsForOrgMember(
                mockSupabase(ADMITTED_NO_PROFILE, "role_permission_grants"),
                USER,
                ORG
            )
        ).toBeNull();
    });

    it("preview and enforcement agree on the failed-read answer", async () => {
        const core = await resolveAdminAccessCore(
            mockSupabase(ADMITTED_NO_PROFILE, "user_access_profiles"),
            USER
        );
        const preview = await resolveAdminAccessDimensionsForOrgMember(
            mockSupabase(ADMITTED_NO_PROFILE, "user_access_profiles"),
            USER,
            ORG
        );
        // The pair's whole purpose: displayed authority and enforced authority cannot disagree.
        expect(preview?.departmentScope).toBe(core?.departmentScope);
        expect(preview?.siteScope).toBe(core?.siteScope);
        expect(preview?.allowedDepartmentIds).toEqual(core?.allowedDepartmentIds);
        expect(preview?.allowedSiteLocationIds).toEqual(core?.allowedSiteLocationIds);
    });
});

describe("W-43 — the third resolver (portal org) denies on read failure", () => {
    const LEGACY: Fixture = {
        user_roles: [],
        legacy_profile_role: "admin",
        app_users: { role: "admin", org_id: ORG },
    };

    it("control: grants portal admission when its reads are healthy", async () => {
        const r = await resolveAdminPortalOrgCore(mockSupabase(LEGACY), USER);
        expect(r?.orgId).toBe(ORG);
        expect(r?.portalEligible).toBe(true);
    });

    it("user_profiles error denies portal admission", async () => {
        expect(await resolveAdminPortalOrgCore(mockSupabase(LEGACY, "user_profiles"), USER)).toBeNull();
    });

    it("app_users error denies portal admission", async () => {
        expect(await resolveAdminPortalOrgCore(mockSupabase(LEGACY, "app_users"), USER)).toBeNull();
    });

    it("user_roles error denies portal admission", async () => {
        expect(await resolveAdminPortalOrgCore(mockSupabase(LEGACY, "user_roles"), USER)).toBeNull();
    });
});

describe("W-43 — the failed-read answer is derived from W-7's denial, not restated", () => {
    it("is `restricted` on both dimensions with denyAll set", () => {
        expect(scopeAnswerForFailedProfileRead()).toEqual({
            departmentScope: "restricted",
            siteScope: "restricted",
            denyAll: true,
        });
    });

    it("does not depend on ABSENT_PROFILE_ENFORCEMENT — that constant governs absence, not failure", () => {
        // The two populations are different, which is why W-43 ships while the constant stays
        // pinned. If this helper ever read the constant, it would silently become `all` today.
        expect(scopeAnswerForFailedProfileRead().denyAll).toBe(true);
    });
});

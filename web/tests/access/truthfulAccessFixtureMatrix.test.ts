/**
 * **Truthful Access milestone — tier C certification matrix.**
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 * Rubric: `docs/platform/planning/vacilando-os/qa/access-identity-v2/07-director-acceptance-rubric.md`.
 *
 * The mission's acceptance form is not "each layer behaves" but **"the Access UI, direct route/API
 * behavior, and effective authorization agree"**, for eleven named principals. So this file does
 * not test three things separately and leave the reader to compose them: for every fixture it
 * derives all three answers and asserts the *agreement itself*. A fixture that made the surface and
 * the route disagree would fail here even if both were independently defensible — which is the only
 * form of check that can catch "hidden in navigation, reachable by URL".
 *
 * **What "the route" means here.** `requireUsersRolesManageAuth` is the real helper the Access
 * routes call, exercised with its access-context dependency mocked at the module boundary. The
 * decision under test is the route's own, not a restatement of it. Everything below the mock —
 * Supabase, cookies, the resolver's I/O — is precisely what a tier C check must not depend on.
 *
 * **What this file is NOT, stated so the record cannot be over-read.** It is not tier D. No browser
 * rendered `/organization/access`, and no fixture below was ever a row in a database. It certifies
 * that the product's *derivations* agree for eleven principals; it does not certify that the
 * hosted environment contains such principals or that the surface paints them. That gap is real and
 * is recorded in the execution record rather than papered over here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    canManageUsersAndRoles,
    SETTINGS_USERS_ROLES_PERMISSION,
} from "@/lib/admin/canManageUsersAndRoles";
import {
    ACCESS_SURFACE_DECLARATIONS,
    availableAccessCommands,
    heldAccessCapabilities,
    isOrganizationDomainVisible,
    visibleAccessChapters,
} from "@/lib/access/surfaceCapabilities";
import { compatibilityPortalRole } from "@/lib/admin/adminPortalRolePick";
import {
    projectMemberAuthentication,
    projectMemberLifecycle,
    projectMemberScope,
    scopeSummary,
    type AuthUserFacts,
} from "@/lib/access/memberIdentityProjection";
import {
    heldRoleKeys,
    roleAssignmentLabel,
    rolesDiscardedByReplacement,
} from "@/lib/access/memberRoleAssignment";
import { ACCESS_WORKSPACE_CHAPTERS } from "@/lib/access/accessChapterRoutes";
import { resolveScopeAnswerFromProfile, ABSENT_PROFILE_ENFORCEMENT } from "@/lib/admin/resolveAdminAccessCore";

/* ---------------------------------------------------------------------- */
/* The route boundary, exercised rather than restated                       */
/* ---------------------------------------------------------------------- */

const getAdminAccessContextCached = vi.fn();
vi.mock("@/lib/admin/getAdminAccessContext", () => ({
    getAdminAccessContextCached: () => getAdminAccessContextCached(),
    loadAdminAccessBundleCached: () => getAdminAccessContextCached(),
}));

/** Imported after the mock is registered, so the helper closes over the mocked dependency. */
const { requireUsersRolesManageAuth } = await import("@/lib/admin/canManageUsersAndRoles");

type Principal = {
    userId: string;
    orgId: string;
    roleKeys: string[];
    permissionKeys: string[];
    departmentScope: "all" | "restricted";
    allowedDepartmentIds: string[] | null;
    siteScope: "all" | "restricted";
    allowedSiteLocationIds: string[] | null;
};

const ORG = "org-fixture";

function principal(over: Partial<Principal> & { userId: string }): Principal {
    return {
        orgId: ORG,
        roleKeys: [],
        permissionKeys: [],
        departmentScope: "all",
        allowedDepartmentIds: null,
        siteScope: "all",
        allowedSiteLocationIds: null,
        ...over,
    };
}

/** The status the Access routes actually return for this principal. */
async function routeStatus(p: Principal | { ok: false; status: 401 | 403 }): Promise<number> {
    getAdminAccessContextCached.mockResolvedValue("ok" in p ? p : { ok: true, ...p, portalEligible: true });
    const auth = await requireUsersRolesManageAuth();
    return auth.ok ? 200 : auth.response.status;
}

/* ---------------------------------------------------------------------- */
/* The subject — what the surface reads about the member being displayed    */
/* ---------------------------------------------------------------------- */

type Subject = {
    roleKeys: string[];
    authFacts: AuthUserFacts | null;
    profileRow: { department_scope?: unknown; site_scope?: unknown } | null;
    departmentIds: string[];
    siteLocationIds: string[];
};

const NOW = Date.parse("2026-08-10T12:00:00.000Z");

function authFacts(over: Partial<AuthUserFacts> = {}): AuthUserFacts {
    return {
        invited_at: null,
        confirmed_at: null,
        email_confirmed_at: null,
        last_sign_in_at: null,
        banned_until: null,
        identities: [{ provider: "email" }],
        factors: [],
        ...over,
    };
}

/* ---------------------------------------------------------------------- */
/* The eleven fixtures                                                      */
/* ---------------------------------------------------------------------- */

type Fixture = {
    id: string;
    /** The mission's own wording for this principal. */
    persona: string;
    caller: Principal;
    /** Expected: may this caller reach the Access surface and its commands at all? */
    admitted: boolean;
    subject: Subject;
    expect: {
        lifecycle: "active" | "invited" | "deactivated" | "unknown";
        /** `null` when the product must present an explicit unknown rather than a method. */
        authenticationState: "known" | "unknown";
        configuredSiteScope: "all" | "restricted" | "unset";
        configuredDepartmentScope: "all" | "restricted" | "unset";
        enforcedSiteScope: "all" | "restricted";
        roleLabel: string | null;
    };
};

const CONFIRMED = "2026-01-04T10:00:00.000Z";

const FIXTURES: Fixture[] = [
    {
        id: "F1",
        persona: "org-wide administrator",
        caller: principal({ userId: "u-admin", roleKeys: ["admin"] }),
        admitted: true,
        subject: {
            roleKeys: ["admin"],
            authFacts: authFacts({ confirmed_at: CONFIRMED, last_sign_in_at: CONFIRMED }),
            profileRow: { department_scope: "all", site_scope: "all" },
            departmentIds: [],
            siteLocationIds: [],
        },
        expect: {
            lifecycle: "active",
            authenticationState: "known",
            configuredSiteScope: "all",
            configuredDepartmentScope: "all",
            enforcedSiteScope: "all",
            roleLabel: "admin",
        },
    },
    {
        id: "F2",
        persona: "location-restricted staff",
        caller: principal({
            userId: "u-loc",
            roleKeys: ["ops"],
            siteScope: "restricted",
            allowedSiteLocationIds: ["loc-a"],
        }),
        admitted: false,
        subject: {
            roleKeys: ["ops"],
            authFacts: authFacts({ confirmed_at: CONFIRMED }),
            profileRow: { department_scope: "all", site_scope: "restricted" },
            departmentIds: [],
            siteLocationIds: ["loc-a"],
        },
        expect: {
            lifecycle: "active",
            authenticationState: "known",
            configuredSiteScope: "restricted",
            configuredDepartmentScope: "all",
            enforcedSiteScope: "restricted",
            roleLabel: "ops",
        },
    },
    {
        id: "F3",
        persona: "department-restricted staff",
        caller: principal({
            userId: "u-dept",
            roleKeys: ["ops"],
            departmentScope: "restricted",
            allowedDepartmentIds: ["dept-a"],
        }),
        admitted: false,
        subject: {
            roleKeys: ["ops"],
            authFacts: authFacts({ confirmed_at: CONFIRMED }),
            profileRow: { department_scope: "restricted", site_scope: "all" },
            departmentIds: ["dept-a"],
            siteLocationIds: [],
        },
        expect: {
            lifecycle: "active",
            authenticationState: "known",
            configuredSiteScope: "all",
            configuredDepartmentScope: "restricted",
            enforcedSiteScope: "all",
            roleLabel: "ops",
        },
    },
    {
        id: "F4",
        persona: "multi-location staff",
        caller: principal({
            userId: "u-multiloc",
            roleKeys: ["ops"],
            siteScope: "restricted",
            allowedSiteLocationIds: ["loc-a", "loc-b", "loc-c"],
        }),
        admitted: false,
        subject: {
            roleKeys: ["ops"],
            authFacts: authFacts({ confirmed_at: CONFIRMED }),
            profileRow: { department_scope: "all", site_scope: "restricted" },
            departmentIds: [],
            siteLocationIds: ["loc-a", "loc-b", "loc-c"],
        },
        expect: {
            lifecycle: "active",
            authenticationState: "known",
            configuredSiteScope: "restricted",
            configuredDepartmentScope: "all",
            enforcedSiteScope: "restricted",
            roleLabel: "ops",
        },
    },
    {
        id: "F5",
        persona: "user with multiple roles",
        caller: principal({ userId: "u-multirole", roleKeys: ["admin", "regional_lead"] }),
        admitted: true,
        subject: {
            roleKeys: ["admin", "regional_lead"],
            authFacts: authFacts({ confirmed_at: CONFIRMED }),
            profileRow: { department_scope: "all", site_scope: "all" },
            departmentIds: [],
            siteLocationIds: [],
        },
        expect: {
            lifecycle: "active",
            authenticationState: "known",
            configuredSiteScope: "all",
            configuredDepartmentScope: "all",
            enforcedSiteScope: "all",
            // IA-7: both, not the survivor of displayRoleForAdminPicker.
            roleLabel: "admin · regional_lead",
        },
    },
    {
        id: "F6",
        persona: "invited / not-yet-admitted user",
        caller: principal({ userId: "u-admin2", roleKeys: ["admin"] }),
        admitted: true,
        subject: {
            roleKeys: ["ops"],
            authFacts: authFacts({ invited_at: "2026-08-01T09:00:00.000Z" }),
            profileRow: null,
            departmentIds: [],
            siteLocationIds: [],
        },
        expect: {
            lifecycle: "invited",
            authenticationState: "known",
            // No profile row was ever created — the defect IA-3 named.
            configuredSiteScope: "unset",
            configuredDepartmentScope: "unset",
            // …while the platform still enforces organization-wide, and the product says both.
            enforcedSiteScope: "all",
            roleLabel: "ops",
        },
    },
    {
        id: "F7",
        persona: "inactive / deactivated membership",
        caller: principal({ userId: "u-admin3", roleKeys: ["admin"] }),
        admitted: true,
        subject: {
            roleKeys: ["ops"],
            authFacts: authFacts({
                confirmed_at: CONFIRMED,
                banned_until: "2027-01-01T00:00:00.000Z",
            }),
            profileRow: { department_scope: "all", site_scope: "all" },
            departmentIds: [],
            siteLocationIds: [],
        },
        expect: {
            lifecycle: "deactivated",
            authenticationState: "known",
            configuredSiteScope: "all",
            configuredDepartmentScope: "all",
            enforcedSiteScope: "all",
            roleLabel: "ops",
        },
    },
    {
        id: "F8",
        persona: "user with no access profile",
        caller: principal({ userId: "u-admin4", roleKeys: ["admin"] }),
        admitted: true,
        subject: {
            roleKeys: ["ops"],
            authFacts: authFacts({ confirmed_at: CONFIRMED }),
            profileRow: null,
            departmentIds: ["dept-x"],
            siteLocationIds: ["loc-x"],
        },
        expect: {
            lifecycle: "active",
            authenticationState: "known",
            configuredSiteScope: "unset",
            configuredDepartmentScope: "unset",
            enforcedSiteScope: "all",
            roleLabel: "ops",
        },
    },
    {
        id: "F9",
        persona: "role permits the capability, scope excludes the target",
        caller: principal({
            userId: "u-scoped-manager",
            roleKeys: ["ops"],
            permissionKeys: [SETTINGS_USERS_ROLES_PERMISSION],
            siteScope: "restricted",
            allowedSiteLocationIds: ["loc-a"],
        }),
        // Layer 2 admits. Layer 3 is a separate question and is asserted below.
        admitted: true,
        subject: {
            roleKeys: ["ops"],
            authFacts: authFacts({ confirmed_at: CONFIRMED }),
            profileRow: { department_scope: "all", site_scope: "restricted" },
            departmentIds: [],
            siteLocationIds: ["loc-a"],
        },
        expect: {
            lifecycle: "active",
            authenticationState: "known",
            configuredSiteScope: "restricted",
            configuredDepartmentScope: "all",
            enforcedSiteScope: "restricted",
            roleLabel: "ops",
        },
    },
    {
        id: "F10",
        persona: "user without Access administration capability",
        caller: principal({ userId: "u-plain-ops", roleKeys: ["ops"] }),
        admitted: false,
        subject: {
            roleKeys: ["ops"],
            authFacts: authFacts({ confirmed_at: CONFIRMED }),
            profileRow: { department_scope: "all", site_scope: "all" },
            departmentIds: [],
            siteLocationIds: [],
        },
        expect: {
            lifecycle: "active",
            authenticationState: "known",
            configuredSiteScope: "all",
            configuredDepartmentScope: "all",
            enforcedSiteScope: "all",
            roleLabel: "ops",
        },
    },
    {
        id: "F11",
        persona: "parent / external principal",
        caller: principal({ userId: "u-parent" }),
        admitted: false,
        subject: {
            // No membership rows at all. The projection must not invent a role.
            roleKeys: [],
            authFacts: null,
            profileRow: null,
            departmentIds: [],
            siteLocationIds: [],
        },
        expect: {
            lifecycle: "unknown",
            authenticationState: "unknown",
            configuredSiteScope: "unset",
            configuredDepartmentScope: "unset",
            enforcedSiteScope: "all",
            roleLabel: null,
        },
    },
];

/**
 * Would a direct navigation to `/organization/access?section=<chapter>` render, for this caller?
 *
 * The page's two refusals, in the page's order: admission first, then the chapter set. Written from
 * the exported predicates rather than restating their rules, so this cannot drift from what the
 * routes enforce; RL-36 separately proves the page composes them in exactly this order.
 */
function urlAdmission(caller: Principal, chapter: (typeof ACCESS_WORKSPACE_CHAPTERS)[number]): boolean {
    if (!canManageUsersAndRoles(caller)) return false;
    return visibleAccessChapters(heldAccessCapabilities(caller)).includes(chapter);
}

beforeEach(() => {
    getAdminAccessContextCached.mockReset();
});

describe("Truthful Access — eleven-fixture certification matrix", () => {
    it("covers every persona the mission names, with no duplicate ids", () => {
        // Non-vacuity for the matrix itself: a table that lost rows would silently certify less.
        expect(FIXTURES).toHaveLength(11);
        expect(new Set(FIXTURES.map((f) => f.id)).size).toBe(11);
        expect(new Set(FIXTURES.map((f) => f.persona)).size).toBe(11);
        expect(FIXTURES.some((f) => f.admitted)).toBe(true);
        expect(FIXTURES.some((f) => !f.admitted)).toBe(true);
    });

    for (const fixture of FIXTURES) {
        describe(`${fixture.id} — ${fixture.persona}`, () => {
            it("presentation, navigation, and the route agree on admission", async () => {
                const held = heldAccessCapabilities(fixture.caller);
                const chapters = visibleAccessChapters(held);
                const navVisible = isOrganizationDomainVisible("access", held);
                const status = await routeStatus(fixture.caller);

                // The claim under test: one predicate, three consumers, no divergence.
                expect(canManageUsersAndRoles(fixture.caller)).toBe(fixture.admitted);
                expect(navVisible).toBe(fixture.admitted);
                expect(chapters.length > 0).toBe(fixture.admitted);
                expect(status).toBe(fixture.admitted ? 200 : 403);

                // Stated as an equality as well, so a future change that moves all four together
                // in the WRONG direction still has to move them together.
                expect(new Set([navVisible, chapters.length > 0, status === 200]).size).toBe(1);
            });

            /**
             * W49-F1. Admission to a chapter is not admission to every control inside it. The
             * mission's acceptance form is agreement between the UI and the route, so it has to
             * hold one level below the chapter too — otherwise a fixture can be correctly admitted
             * and still be offered a command its own 403 is waiting for.
             */
            it("offers only the commands this caller's routes would accept", () => {
                const offered = availableAccessCommands(fixture.caller);

                // The oracle is the route's OWN derivation — `getAdminContext` builds `ctx.role`
                // with `compatibilityPortalRole`, and the route refuses unless that is "admin".
                // Deriving the expectation from `hasPortalAdminMutateAccess` instead would just be
                // the resolver checking itself.
                const routeWouldAccept = compatibilityPortalRole(fixture.caller.roleKeys) === "admin";
                expect(offered.includes("password-reset")).toBe(routeWouldAccept);

                // A principal refused the whole surface is offered no command at all — the two
                // gates compose rather than each admitting on its own.
                if (!fixture.admitted) expect(offered).toEqual([]);
            });

            it("a hidden chapter is not reachable by URL", () => {
                // AE-4's acceptance form, and the one shape a per-layer test cannot catch: the
                // chapter offered in navigation and the chapter admitted by URL must come from the
                // SAME evaluation. `urlAdmission` composes the exported predicates in the order
                // the page applies them; that the page actually applies them in that order — gate
                // before `?section=` resolution — is proved separately by RL-36 in
                // `surfaceCapabilityDeclaration.test.ts` against the real page source.
                const chapters = visibleAccessChapters(heldAccessCapabilities(fixture.caller));
                for (const chapter of ACCESS_WORKSPACE_CHAPTERS) {
                    const offeredInNav = chapters.includes(chapter);
                    const admittedByUrl = urlAdmission(fixture.caller, chapter);
                    expect(admittedByUrl).toBe(offeredInNav);
                    expect(admittedByUrl).toBe(fixture.admitted);
                    // Every chapter gates on the capability the backing routes require, so the
                    // surface gate is true "for the same reason" the command gate is.
                    expect(ACCESS_SURFACE_DECLARATIONS[chapter].capability).toBe(
                        SETTINGS_USERS_ROLES_PERMISSION,
                    );
                }
            });

            it("lifecycle is derived, never asserted", () => {
                const lifecycle = projectMemberLifecycle(fixture.subject.authFacts, NOW);
                expect(lifecycle.state).toBe(fixture.expect.lifecycle);
                // IA-R1: an unknown must carry its reason, or the operator cannot tell "not read"
                // from "read and fine".
                if (lifecycle.state === "unknown") {
                    expect(lifecycle.unknown_reason).toBeTruthy();
                } else {
                    expect(lifecycle.unknown_reason).toBeNull();
                }
            });

            it("authentication is reported only where it is knowable", () => {
                const auth = projectMemberAuthentication(fixture.subject.authFacts);
                if (fixture.expect.authenticationState === "unknown") {
                    expect(auth.state).toBe("unknown");
                    expect(auth.methods).toEqual([]);
                    expect(auth.mfa_unknown_reason).toBeTruthy();
                } else {
                    expect(auth.state).not.toBe("unknown");
                }
            });

            it("configured scope and enforced scope are both reported, and are distinguishable", () => {
                const scope = projectMemberScope({
                    profileRow: fixture.subject.profileRow,
                    departmentIds: fixture.subject.departmentIds,
                    siteLocationIds: fixture.subject.siteLocationIds,
                });
                expect(scope.site_scope).toBe(fixture.expect.configuredSiteScope);
                expect(scope.department_scope).toBe(fixture.expect.configuredDepartmentScope);
                expect(scope.effective_site_scope).toBe(fixture.expect.enforcedSiteScope);

                // The enforced answer comes from the enforcing resolver, not a second opinion.
                const enforcing = resolveScopeAnswerFromProfile(
                    fixture.subject.profileRow,
                    ABSENT_PROFILE_ENFORCEMENT,
                );
                expect(scope.effective_site_scope).toBe(enforcing.siteScope);
                expect(scope.effective_department_scope).toBe(enforcing.departmentScope);

                // IA-3 — the defect this milestone exists to remove. An absent profile must never
                // present as "All locations · All departments", and the divergence must be stated.
                if (fixture.expect.configuredSiteScope === "unset") {
                    expect(scope.has_access_profile).toBe(false);
                    expect(scope.effective_divergence_reason).toBeTruthy();
                    const summary = scopeSummary({
                        configured: scope.site_scope,
                        ids: scope.site_location_ids,
                        labelFor: () => null,
                        allLabel: "All locations",
                        noneLabel: "No locations",
                        unitSingular: "location",
                        unitPlural: "locations",
                    });
                    expect(summary.label).not.toBe("All locations");
                    expect(summary.certainty).toBe("unset");
                    // Allow-list rows are withheld for an unset profile: showing them would read
                    // as a configured scope that nobody configured.
                    expect(scope.site_location_ids).toEqual([]);
                } else {
                    expect(scope.effective_divergence_reason).toBeNull();
                }
            });

            it("assigned roles are the union the schema stores", () => {
                const label = roleAssignmentLabel({ role_keys: fixture.subject.roleKeys }, (k) => k);
                expect(label).toBe(fixture.expect.roleLabel);
                expect(heldRoleKeys({ role_keys: fixture.subject.roleKeys })).toEqual(
                    [...fixture.subject.roleKeys].sort((a, b) => a.localeCompare(b)),
                );
            });
        });
    }
});

describe("The layers are separable — capability is not scope", () => {
    it("F9 is admitted by capability and still bounded by scope", async () => {
        const f9 = FIXTURES.find((f) => f.id === "F9")!;

        // Layer 2 — the capability admits, so the surface opens and the route returns 200.
        expect(canManageUsersAndRoles(f9.caller)).toBe(true);
        expect(await routeStatus(f9.caller)).toBe(200);

        // Layer 3 — and the principal's own authority is still restricted to one location. This is
        // the pair the mission asks for: "role permits a capability but scope excludes the target".
        // Admission is not authority over every target, and the product must not imply it is.
        expect(f9.caller.siteScope).toBe("restricted");
        expect(f9.caller.allowedSiteLocationIds).toEqual(["loc-a"]);
        expect(f9.caller.allowedSiteLocationIds).not.toContain("loc-b");

        // F1, holding the same capability, is bounded by nothing — so the distinction is real and
        // not an artifact of every fixture being restricted.
        const f1 = FIXTURES.find((f) => f.id === "F1")!;
        expect(canManageUsersAndRoles(f1.caller)).toBe(true);
        expect(f1.caller.siteScope).toBe("all");
    });

    it("an unauthenticated caller is refused before capability is consulted", async () => {
        expect(await routeStatus({ ok: false, status: 401 })).toBe(401);
        expect(await routeStatus({ ok: false, status: 403 })).toBe(403);
    });
});

describe("M2-17 across the matrix — no replacement deletes an unshown role", () => {
    it("only the multi-role fixture has anything to lose, and it is named", () => {
        const losses = FIXTURES.map((f) => ({
            id: f.id,
            lost: rolesDiscardedByReplacement({ role_keys: f.subject.roleKeys }, f.subject.roleKeys[0] ?? ""),
        }));
        const withLoss = losses.filter((l) => l.lost.length > 0);
        expect(withLoss.map((l) => l.id)).toEqual(["F5"]);
        // The role that used to vanish silently between the database and the screen.
        expect(withLoss[0]!.lost).toEqual(["regional_lead"]);
    });
});

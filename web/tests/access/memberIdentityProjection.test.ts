/**
 * W-46 / W-47 (tier B) — the member projection asserts nothing it did not read.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 *
 * The defect this locks is not "the label was wrong"; it is that `?? "all"` and a string literal
 * `Active` produced *the same output for two different worlds*. So every case here is stated as a
 * pair: the configured/read world, and the absent/unread world that used to be indistinguishable
 * from it.
 *
 * Fixtures are annotated, never `as`-cast. A cast into `AuthUserFacts` would let a field this
 * projection depends on disappear while the suite stayed green — the failure mode Trust 2.7 paid
 * for.
 */
import { describe, expect, it } from "vitest";
import {
    ABSENT_PROFILE_DIVERGENCE_REASON,
    authenticationMethodLabel,
    LIFECYCLE_UNREADABLE_REASON,
    projectMemberAuthentication,
    projectMemberLifecycle,
    projectMemberScope,
    scopeSummary,
    type AuthUserFacts,
} from "@/lib/access/memberIdentityProjection";
import { ABSENT_PROFILE_ENFORCEMENT } from "@/lib/admin/resolveAdminAccessCore";

const NOW = Date.parse("2026-08-10T12:00:00.000Z");

describe("projectMemberScope — absent is not org-wide (W-47, IA-R3)", () => {
    it("a membership with no access profile row reports `unset`, not `all`", () => {
        const projection = projectMemberScope({
            profileRow: null,
            departmentIds: ["dept-1"],
            siteLocationIds: ["loc-1"],
        });

        expect(projection.department_scope).toBe("unset");
        expect(projection.site_scope).toBe("unset");
        expect(projection.has_access_profile).toBe(false);
    });

    it("a profile row that says `all` reports `all` — the two are now distinguishable", () => {
        const configured = projectMemberScope({
            profileRow: { department_scope: "all", site_scope: "all" },
            departmentIds: [],
            siteLocationIds: [],
        });
        const absent = projectMemberScope({ profileRow: null, departmentIds: [], siteLocationIds: [] });

        // The whole workstream in one assertion: these were the same value before.
        expect(configured.department_scope).not.toBe(absent.department_scope);
        expect(configured.has_access_profile).toBe(true);
        expect(configured.effective_divergence_reason).toBeNull();
        expect(absent.effective_divergence_reason).toBe(ABSENT_PROFILE_DIVERGENCE_REASON);
    });

    it("an absent profile still reports what the platform ENFORCES, so the surface cannot imply denial", () => {
        const absent = projectMemberScope({ profileRow: null, departmentIds: [], siteLocationIds: [] });

        // `ABSENT_PROFILE_ENFORCEMENT` is `legacy-all` until W-7 flips it. Rendering "No access
        // configured" alone would swap one false certainty for another, so the projection carries
        // the enforced answer too — and takes it from the enforcing resolver, not from a copy of
        // its rule. When W-7 flips the constant this expectation follows it without an edit here.
        const expected = ABSENT_PROFILE_ENFORCEMENT === "deny" ? "restricted" : "all";
        expect(absent.effective_site_scope).toBe(expected);
        expect(absent.effective_department_scope).toBe(expected);
    });

    it("allow-lists are reported only where the configuration makes them meaningful", () => {
        const restricted = projectMemberScope({
            profileRow: { department_scope: "restricted", site_scope: "all" },
            departmentIds: ["dept-1", "dept-2"],
            siteLocationIds: ["loc-1"],
        });
        expect(restricted.department_ids).toEqual(["dept-1", "dept-2"]);
        // `site_scope` is `all`, so the site allow-list is not a scope statement.
        expect(restricted.site_location_ids).toEqual([]);

        // An `unset` membership may hold access rows — §5 records that table as a sixth authority
        // table — and listing them beside "no profile" would read as a configured scope.
        const unset = projectMemberScope({
            profileRow: null,
            departmentIds: ["dept-1"],
            siteLocationIds: ["loc-1"],
        });
        expect(unset.department_ids).toEqual([]);
        expect(unset.site_location_ids).toEqual([]);
    });

    it("an unrecognized scope value is `all`, matching the enforcing resolver rather than guessing", () => {
        const projection = projectMemberScope({
            profileRow: { department_scope: "  RESTRICTED  ", site_scope: "nonsense" },
            departmentIds: ["dept-1"],
            siteLocationIds: [],
        });
        // `resolveScopeAnswerFromProfile` compares the trimmed string to `restricted` exactly, so
        // a differently-cased value is NOT restricted there. Presentation must agree with it.
        expect(projection.department_scope).toBe("all");
        expect(projection.site_scope).toBe("all");
        expect(projection.effective_department_scope).toBe("all");
    });
});

describe("projectMemberLifecycle — no `active` that was not read (W-46, IA-R1/IA-R2)", () => {
    it("an unreadable auth record is `unknown`, with the reason, and never `active`", () => {
        const projection = projectMemberLifecycle(null, NOW);
        expect(projection.state).toBe("unknown");
        expect(projection.unknown_reason).toBe(LIFECYCLE_UNREADABLE_REASON);
        expect(projection.last_sign_in_at).toBeNull();
    });

    it("invited-but-never-confirmed is `invited` — the exact user IA-1 says rendered as Active", () => {
        const invited: AuthUserFacts = {
            invited_at: "2026-08-10T11:00:00.000Z",
            confirmed_at: null,
            email_confirmed_at: null,
            last_sign_in_at: null,
        };
        const projection = projectMemberLifecycle(invited, NOW);
        expect(projection.state).toBe("invited");
        expect(projection.invited_at).toBe("2026-08-10T11:00:00.000Z");
    });

    it("a confirmed account is `active`, and carries the sign-in it was read from", () => {
        const confirmed: AuthUserFacts = {
            confirmed_at: "2026-07-01T00:00:00.000Z",
            last_sign_in_at: "2026-08-09T09:30:00.000Z",
        };
        const projection = projectMemberLifecycle(confirmed, NOW);
        expect(projection.state).toBe("active");
        expect(projection.last_sign_in_at).toBe("2026-08-09T09:30:00.000Z");
    });

    it("a future `banned_until` outranks confirmation — a disabled account is not Active", () => {
        const banned: AuthUserFacts = {
            confirmed_at: "2026-07-01T00:00:00.000Z",
            last_sign_in_at: "2026-08-09T09:30:00.000Z",
            banned_until: "2026-09-01T00:00:00.000Z",
        };
        const projection = projectMemberLifecycle(banned, NOW);
        expect(projection.state).toBe("deactivated");
        expect(projection.deactivated_until).toBe("2026-09-01T00:00:00.000Z");
    });

    it("a lapsed ban is not a deactivation, and an unparseable one is not either", () => {
        const lapsed: AuthUserFacts = {
            confirmed_at: "2026-07-01T00:00:00.000Z",
            banned_until: "2026-08-01T00:00:00.000Z",
        };
        expect(projectMemberLifecycle(lapsed, NOW).state).toBe("active");

        // Deactivating an account on a string the projection did not understand would be a
        // lockout caused by presentation code. It is treated as absent instead.
        const garbled: AuthUserFacts = { confirmed_at: "2026-07-01T00:00:00.000Z", banned_until: "never" };
        expect(projectMemberLifecycle(garbled, NOW).state).toBe("active");
    });

    it("read, but neither confirmed nor invited, is `unknown` — W-26 names that state, not this projection", () => {
        const projection = projectMemberLifecycle({ invited_at: null, confirmed_at: null }, NOW);
        expect(projection.state).toBe("unknown");
        expect(projection.unknown_reason).toBeTruthy();
    });
});

describe("projectMemberAuthentication — `Password` is read, not assumed (W-45)", () => {
    it("an unreadable record yields `unknown`, and its label is not a method name", () => {
        const projection = projectMemberAuthentication(null);
        expect(projection.state).toBe("unknown");
        expect(authenticationMethodLabel(projection)).toBe("Unknown");
    });

    it("an email identity renders as Password because the identity said so", () => {
        const projection = projectMemberAuthentication({ identities: [{ provider: "email" }] });
        expect(projection.methods).toEqual(["email"]);
        expect(authenticationMethodLabel(projection)).toBe("Password");
    });

    it("a second provider is reported the day it ships, not on the day W-33 lands", () => {
        // 06…§4.1: "Password sign-in" is correct today only because password is the single
        // implemented method — "and silently wrong on the day a second one ships."
        const projection = projectMemberAuthentication({
            identities: [{ provider: "google" }, { provider: "email" }],
        });
        expect(authenticationMethodLabel(projection)).toBe("Password · Google");
    });

    it("an unmapped provider renders as itself, never as Password", () => {
        const projection = projectMemberAuthentication({ identities: [{ provider: "okta" }] });
        expect(authenticationMethodLabel(projection)).toBe("okta");
    });

    it("no identities is `Not configured`, which is not the same as unknown", () => {
        const projection = projectMemberAuthentication({ identities: [] });
        expect(projection.state).toBe("none");
        expect(authenticationMethodLabel(projection)).toBe("Not configured");
    });

    it("absent `factors` is unknown; empty `factors` is none; a verified factor is enrolled", () => {
        expect(projectMemberAuthentication({ identities: [{ provider: "email" }] }).mfa).toBe("unknown");
        expect(projectMemberAuthentication({ identities: [], factors: [] }).mfa).toBe("none");
        expect(projectMemberAuthentication({ identities: [], factors: [{ status: "verified" }] }).mfa).toBe(
            "enrolled",
        );
        // An unverified enrolment in progress is not a second factor.
        expect(projectMemberAuthentication({ identities: [], factors: [{ status: "unverified" }] }).mfa).toBe(
            "none",
        );
    });
});

describe("scopeSummary — the label and its certainty travel together", () => {
    const labelFor = (id: string) => (id === "loc-1" ? "Riverside" : null);
    const base = {
        ids: [] as string[],
        labelFor,
        allLabel: "All locations",
        noneLabel: "No locations selected",
        unitSingular: "location",
        unitPlural: "locations",
    };

    it("`unset` never renders as a reassurance", () => {
        const summary = scopeSummary({ ...base, configured: "unset" });
        expect(summary.label).toBe("No access configured");
        expect(summary.label).not.toContain("All");
        expect(summary.certainty).toBe("unset");
    });

    it("`all` and `restricted` are read values", () => {
        expect(scopeSummary({ ...base, configured: "all" })).toEqual({
            label: "All locations",
            certainty: "read",
        });
        expect(scopeSummary({ ...base, configured: "restricted", ids: ["loc-1"] })).toEqual({
            label: "Riverside",
            certainty: "read",
        });
        expect(scopeSummary({ ...base, configured: "restricted", ids: ["loc-1", "loc-2"] }).label).toBe(
            "2 locations",
        );
        expect(scopeSummary({ ...base, configured: "restricted" }).label).toBe("No locations selected");
    });

    it("restricted-with-nothing-selected is distinct from unconfigured", () => {
        // Both are "this person reaches nothing", but only one was decided by an operator.
        const restricted = scopeSummary({ ...base, configured: "restricted" });
        const unset = scopeSummary({ ...base, configured: "unset" });
        expect(restricted.label).not.toBe(unset.label);
    });
});

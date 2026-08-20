/**
 * W-46 / W-47 — the member projection, as a pure function of what was actually read.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 *
 * **Why this module exists rather than more code in the route.** `IA-R1` is *"a value the system
 * did not compute MUST render as Planned or Unknown"*, and the way a surface breaks that rule is
 * never by deciding to lie — it is by a `?? "all"` in a projection nobody tests. Every derivation
 * that turns a read into a claim lives here, takes only what was read, and is exercised by
 * `web/tests/access/memberIdentityProjection.test.ts` without a database. The route's remaining
 * job is fetching.
 *
 * **The three states, and why the third is the whole workstream.**
 * `members/route.ts` previously wrote `prof?.department_scope ?? "all"`. `06…§4.3` (`IA-3`) records
 * what that buys: *"All locations · All departments"* is **indistinguishable from *no access
 * profile was ever created*** — `01…§31` calls it *"the fail-open in GAP-3, rendered as a
 * reassurance."* So `configured` carries three values, not two: `all`, `restricted`, and
 * **`unset`** — the membership has no `user_access_profiles` row at all.
 *
 * **`unset` is not the same as "no access", and this module refuses to imply it is.**
 * `ABSENT_PROFILE_ENFORCEMENT` is `legacy-all` today (`resolveAdminAccessCore.ts`): a membership
 * with no profile row is currently enforced as organization-wide. `W-7` flips that constant to
 * `deny`; until it does, rendering *"No access configured"* alone would replace one false
 * certainty with another. So the projection carries **both** facts — what is configured, and what
 * the enforcing constant does with it — and it derives the second by calling the enforcing
 * resolver rather than restating its rule. `IA-R4`'s *"MUST NOT have a second implementation"*
 * applied a wave early, because it costs one import.
 *
 * **Lifecycle is derived, never asserted.** `IA-R2` requires invitation state, last sign-in, lock
 * state and MFA-factor presence — *"or state per field why it cannot."* The per-field escape hatch
 * is the reason `unknownReason` exists on every block: when `auth.admin.getUserById` fails, the
 * honest projection is `unknown` **with the reason**, not `active`.
 */

import {
    ABSENT_PROFILE_ENFORCEMENT,
    resolveScopeAnswerFromProfile,
    type ProfileScopeRow,
} from "@/lib/admin/resolveAdminAccessCore";

/* ------------------------------------------------------------------------ */
/* Scope                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * What the operator configured. `unset` means no `user_access_profiles` row exists — the state
 * `06…§6` upgraded *"from a design gap to a verified impossibility: the members route cannot emit
 * the distinction, so no rendering can show it."* It can now.
 */
export type ConfiguredScope = "all" | "restricted" | "unset";

/** What the platform enforces for that configuration, today, per `ABSENT_PROFILE_ENFORCEMENT`. */
export type EnforcedScope = "all" | "restricted";

export type MemberScopeProjection = {
    /** What is stored. `unset` is a first-class answer, never coerced to `all`. */
    department_scope: ConfiguredScope;
    site_scope: ConfiguredScope;
    /** Whether a `user_access_profiles` row was read for this membership. */
    has_access_profile: boolean;
    /**
     * What the enforcing resolver answers for this profile row right now. Derived by calling
     * `resolveScopeAnswerFromProfile` — not by restating its rule.
     */
    effective_department_scope: EnforcedScope;
    effective_site_scope: EnforcedScope;
    /**
     * Set only when configuration and enforcement disagree, which today happens exactly when the
     * profile row is absent. The surface must say this out loud rather than pick one of the two.
     */
    effective_divergence_reason: string | null;
    department_ids: string[];
    site_location_ids: string[];
};

export const ABSENT_PROFILE_DIVERGENCE_REASON =
    "No access profile exists for this membership. Alloy currently treats an absent profile as " +
    "organization-wide (legacy behaviour); scope is not restricted until a profile is configured.";

/**
 * @param profileRow - the `user_access_profiles` row, or `null`/`undefined` when none exists.
 *   The distinction between "absent" and "present with defaults" is the entire point; callers
 *   must not substitute an object for a missing row.
 */
export function projectMemberScope(args: {
    profileRow: ProfileScopeRow;
    departmentIds: string[];
    siteLocationIds: string[];
}): MemberScopeProjection {
    const { profileRow } = args;
    const present = Boolean(profileRow);

    const department_scope: ConfiguredScope =
        !present ? "unset"
        : String((profileRow as { department_scope?: unknown }).department_scope ?? "").trim() === "restricted" ?
            "restricted"
        :   "all";
    const site_scope: ConfiguredScope =
        !present ? "unset"
        : String((profileRow as { site_scope?: unknown }).site_scope ?? "").trim() === "restricted" ? "restricted"
        :   "all";

    const enforced = resolveScopeAnswerFromProfile(profileRow, ABSENT_PROFILE_ENFORCEMENT);

    // Allow-lists are reported only where the configuration makes them meaningful. An `unset`
    // membership may still hold `user_department_access` rows — §5 records that table as a sixth
    // authority table — and listing them beside "no profile" would read as a configured scope.
    const department_ids = department_scope === "restricted" ? args.departmentIds : [];
    const site_location_ids = site_scope === "restricted" ? args.siteLocationIds : [];

    return {
        department_scope,
        site_scope,
        has_access_profile: present,
        effective_department_scope: enforced.departmentScope,
        effective_site_scope: enforced.siteScope,
        effective_divergence_reason: present ? null : ABSENT_PROFILE_DIVERGENCE_REASON,
        department_ids,
        site_location_ids,
    };
}

/* ------------------------------------------------------------------------ */
/* Lifecycle                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * The account lifecycle states this projection can actually derive from the auth record.
 *
 * `W-26` owns the authoritative state machine (`AD-18`); until it lands, these are the states
 * `auth.users` supports, and `unknown` is what an unreadable record produces. There is no
 * `active` that is not read.
 */
export type MemberLifecycleState = "active" | "invited" | "deactivated" | "unknown";

export type MemberLifecycleProjection = {
    state: MemberLifecycleState;
    invited_at: string | null;
    confirmed_at: string | null;
    last_sign_in_at: string | null;
    /** `banned_until` in the future — Supabase's representation of a disabled account. */
    deactivated_until: string | null;
    /** Non-null exactly when `state` is `unknown`. `IA-R2`'s per-field escape hatch. */
    unknown_reason: string | null;
};

export type MemberAuthenticationProjection = {
    /** Identity providers actually attached to the account, e.g. `["email"]`. */
    methods: string[];
    /** `unknown` when the auth record could not be read; `none` when it was read and is empty. */
    state: "known" | "none" | "unknown";
    /** Verified MFA factors, when the record carries the field. */
    mfa: "enrolled" | "none" | "unknown";
    mfa_unknown_reason: string | null;
    unknown_reason: string | null;
};

/** The subset of the Supabase admin `User` this projection reads. Never `as`-cast into. */
export type AuthUserFacts = {
    invited_at?: string | null;
    confirmed_at?: string | null;
    email_confirmed_at?: string | null;
    last_sign_in_at?: string | null;
    banned_until?: string | null;
    identities?: { provider?: string | null }[] | null;
    factors?: { status?: string | null }[] | null;
};

export const LIFECYCLE_UNREADABLE_REASON =
    "The authentication record for this membership could not be read, so its account state is unknown.";

const MFA_NO_SOURCE_REASON =
    "The authentication record carries no factor list, so multi-factor enrolment cannot be determined.";

/**
 * @param nowMs - injected so `banned_until` is evaluated against a caller-supplied instant. A
 *   projection that reads the clock itself cannot be tested for the boundary it exists to check.
 */
export function projectMemberLifecycle(
    user: AuthUserFacts | null | undefined,
    nowMs: number
): MemberLifecycleProjection {
    if (!user) {
        return {
            state: "unknown",
            invited_at: null,
            confirmed_at: null,
            last_sign_in_at: null,
            deactivated_until: null,
            unknown_reason: LIFECYCLE_UNREADABLE_REASON,
        };
    }

    const invited_at = user.invited_at ?? null;
    const confirmed_at = user.confirmed_at ?? user.email_confirmed_at ?? null;
    const last_sign_in_at = user.last_sign_in_at ?? null;

    // A `banned_until` in the past is a lapsed ban, not a disabled account. An unparseable value
    // is treated as absent rather than as a ban — the opposite would deactivate an account on a
    // string it did not understand.
    const bannedUntilMs = user.banned_until ? Date.parse(user.banned_until) : NaN;
    const deactivated = Number.isFinite(bannedUntilMs) && bannedUntilMs > nowMs;
    const deactivated_until = deactivated ? (user.banned_until ?? null) : null;

    const state: MemberLifecycleState =
        deactivated ? "deactivated"
        : confirmed_at ? "active"
        : invited_at ? "invited"
          // Read, but neither confirmed nor invited: a state the current schema does not name.
          // `W-26` decides what it is called; asserting `active` here is exactly `IA-1`.
        : last_sign_in_at ? "active"
        : "unknown";

    return {
        state,
        invited_at,
        confirmed_at,
        last_sign_in_at,
        deactivated_until,
        unknown_reason:
            state === "unknown" ?
                "The account is neither confirmed nor invited in the authentication record, so its state is not yet named."
            :   null,
    };
}

export function projectMemberAuthentication(
    user: AuthUserFacts | null | undefined
): MemberAuthenticationProjection {
    if (!user) {
        return {
            methods: [],
            state: "unknown",
            mfa: "unknown",
            mfa_unknown_reason: LIFECYCLE_UNREADABLE_REASON,
            unknown_reason: LIFECYCLE_UNREADABLE_REASON,
        };
    }

    const methods = [
        ...new Set(
            (user.identities ?? [])
                .map((i) => (typeof i?.provider === "string" ? i.provider.trim() : ""))
                .filter((p) => p.length > 0)
        ),
    ].sort();

    // `factors: undefined` is "the record did not carry the field"; `factors: []` is "it did, and
    // there are none." Collapsing the two is how `Password` became a literal in the first place.
    const factors = user.factors;
    const mfa: MemberAuthenticationProjection["mfa"] =
        factors === undefined || factors === null ? "unknown"
        : factors.some((f) => f?.status === "verified") ? "enrolled"
        : "none";

    return {
        methods,
        state: methods.length > 0 ? "known" : "none",
        mfa,
        mfa_unknown_reason: mfa === "unknown" ? MFA_NO_SOURCE_REASON : null,
        unknown_reason:
            methods.length === 0 ?
                "The authentication record lists no identity provider, so the sign-in method is not known."
            :   null,
    };
}

/* ------------------------------------------------------------------------ */
/* Presentation                                                              */
/* ------------------------------------------------------------------------ */

/** Operator-facing label for a lifecycle state. `unknown` never renders as a status word. */
export const MEMBER_LIFECYCLE_LABEL: Record<MemberLifecycleState, string> = {
    active: "Active",
    invited: "Invited",
    deactivated: "Deactivated",
    unknown: "Unknown",
};

/** Provider ids the product has a name for. An unmapped provider renders as its own id, not as "Password". */
const PROVIDER_LABEL: Record<string, string> = {
    email: "Password",
    phone: "Phone",
    google: "Google",
    azure: "Microsoft",
    apple: "Apple",
};

export function authenticationMethodLabel(projection: MemberAuthenticationProjection): string {
    if (projection.state === "unknown") return "Unknown";
    if (projection.methods.length === 0) return "Not configured";
    return projection.methods.map((m) => PROVIDER_LABEL[m] ?? m).join(" · ");
}

/**
 * The scope summary line. Returns the label **and** whether it is a read value, so a caller can
 * mark an unknown without re-deriving the rule — the `data-capability` discipline `06…§4.10`
 * calls *"this surface's best property"* only works if the projection says which is which.
 */
export function scopeSummary(args: {
    configured: ConfiguredScope;
    ids: string[];
    labelFor: (id: string) => string | null;
    allLabel: string;
    noneLabel: string;
    unitSingular: string;
    unitPlural: string;
}): { label: string; certainty: "read" | "unset" } {
    if (args.configured === "unset") return { label: "No access configured", certainty: "unset" };
    if (args.configured === "all") return { label: args.allLabel, certainty: "read" };
    const n = args.ids.length;
    if (n === 0) return { label: args.noneLabel, certainty: "read" };
    if (n === 1) return { label: args.labelFor(args.ids[0]!) ?? `1 ${args.unitSingular}`, certainty: "read" };
    return { label: `${n} ${args.unitPlural}`, certainty: "read" };
}

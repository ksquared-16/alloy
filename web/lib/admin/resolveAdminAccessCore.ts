import type { SupabaseClient } from "@supabase/supabase-js";

export type DepartmentScopeMode = "all" | "restricted";
export type SiteScopeMode = "all" | "restricted";

export type ResolvedAdminAccessCore = {
    orgId: string;
    roleKeys: string[];
    permissionKeys: string[];
    departmentScope: DepartmentScopeMode;
    allowedDepartmentIds: string[] | null;
    siteScope: SiteScopeMode;
    allowedSiteLocationIds: string[] | null;
    /** True when role_keys for this org include admin or ops (admin shell / legacy PATCH gate). */
    portalEligible: boolean;
};

const PORTAL_ROLES = new Set(["admin", "ops"]);

/**
 * W-42 (`I-28`ᴬ, `RL-24`) — THE normal form for a role key. One function, applied at the boundary.
 *
 * `02…§18` (`M2-11`): the enforcing resolver built `roleKeys` **raw** and the preview built them
 * **trimmed**, so a membership row holding `"admin "` produced two different answers — the
 * enforcing path yielded `portalEligible: false` and an empty capability set while the preview
 * yielded `portalEligible: true` and the full `admin` grant set. *"Settings → Users & Roles shows a
 * working portal administrator; every runtime gate returns 401/403."*
 *
 * **The finding is that the model has no defined normal form**, not that padded rows exist. The
 * product's own assignment path already trims, so this state is not reachable through the UI — it
 * is reachable through the writers `M2-2` shows are unconstrained: seeds, imports, direct SQL.
 *
 * **Admission-set consequence, recorded rather than buried.** Normalizing is what the plan
 * specifies (`W-42`, gated by nothing), and it resolves the divergence in the direction of the
 * operator's evident intent: a row written as `"admin "` or `"Admin"` was meant to be `admin`. It
 * therefore WIDENS enforcement for such a row — from "admitted by the preview, refused by every
 * gate" to "admitted by both". It cannot widen anything for a row that is already normal, which is
 * every row the product itself has ever written.
 */
export function normalizeRoleKey(raw: unknown): string {
    return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/**
 * W-7 (I-19, lockout class L1) — absent scope denies.
 *
 * Which answer the resolver *enforces* when a membership has no `user_access_profiles` row.
 * - `legacy-all` — the historical fail-open: both dimensions resolve `all`.
 * - `deny`       — W-7's target: the membership sees nothing.
 *
 * MUST remain `legacy-all` until M1 (`20260807140000_backfill_membership_access_profiles.sql`)
 * is APPLIED on the shared target. W-0 Q4 stands at 2 `(user, org)` pairs with no profile row,
 * so flipping this ahead of the backfill locks out those 2 principals — the exact L1 outcome
 * W-7 exists to avoid. Plan §5 Q4: "W-7 cannot precede it."
 *
 * Flipping this constant to `deny` and deleting the two lines above it is the whole switch.
 */
export type AbsentProfileMode = "legacy-all" | "deny";

export const ABSENT_PROFILE_ENFORCEMENT: AbsentProfileMode = "legacy-all";

export type ProfileScopeRow = { department_scope?: unknown; site_scope?: unknown } | null | undefined;

export type ScopeAnswer = {
    departmentScope: DepartmentScopeMode;
    siteScope: SiteScopeMode;
    /**
     * True only for the absent-profile denial. Denial is `restricted` *plus explicitly empty
     * allow-lists* — never `restricted` alone. A membership with no profile row may still hold
     * `user_department_access` / `user_site_access` rows, and §5 records that table as a sixth
     * authority table with a self-authority write path W-8 arms. Letting denial fall through to
     * "restricted, then read whatever those tables hold" would let a principal grant itself the
     * departments its missing profile was supposed to withhold.
     */
    denyAll: boolean;
};

/** Pure: the scope answer a given profile row yields under a given absent-profile mode. */
export function resolveScopeAnswerFromProfile(
    profileRow: ProfileScopeRow,
    mode: AbsentProfileMode
): ScopeAnswer {
    if (profileRow) {
        const ds = String(profileRow.department_scope ?? "").trim();
        const ss = String(profileRow.site_scope ?? "").trim();
        return {
            departmentScope: ds === "restricted" ? "restricted" : "all",
            siteScope: ss === "restricted" ? "restricted" : "all",
            denyAll: false,
        };
    }
    if (mode === "deny") {
        return { departmentScope: "restricted", siteScope: "restricted", denyAll: true };
    }
    return { departmentScope: "all", siteScope: "all", denyAll: false };
}

/**
 * Step 2 of the L1 ritual: resolve BOTH answers, enforce the configured one, and report whether
 * they differ. A divergence after W-5 and W-6 means a membership was created outside the atomic
 * path — the defect worth finding before the switch rather than after.
 */
export function dualReadScopeAnswer(profileRow: ProfileScopeRow): {
    enforced: ScopeAnswer;
    shadow: ScopeAnswer;
    diverges: boolean;
} {
    const shadowMode: AbsentProfileMode = ABSENT_PROFILE_ENFORCEMENT === "deny" ? "legacy-all" : "deny";
    const enforced = resolveScopeAnswerFromProfile(profileRow, ABSENT_PROFILE_ENFORCEMENT);
    const shadow = resolveScopeAnswerFromProfile(profileRow, shadowMode);
    const diverges =
        enforced.departmentScope !== shadow.departmentScope ||
        enforced.siteScope !== shadow.siteScope ||
        enforced.denyAll !== shadow.denyAll;
    return { enforced, shadow, diverges };
}

/**
 * W-43 (`I-30`ᴬ, GAP-3's read-error leg) — the scope answer a FAILED read yields.
 *
 * Derived from W-7's denial rather than restated, so the two cannot drift into two different
 * meanings of "deny". Denial is `restricted` *plus* explicitly empty allow-lists (`denyAll`), for
 * the reason {@link ScopeAnswer.denyAll} records.
 *
 * **This is a different population from {@link ABSENT_PROFILE_ENFORCEMENT}, and that is why it can
 * ship while that constant is still pinned to `legacy-all`.** That constant governs a membership
 * whose profile row is genuinely ABSENT — 2 known `(user, org)` pairs — and flipping it before the
 * M1 backfill locks those principals out. A read FAILURE is not that population: it is a transient
 * fault affecting whoever happens to be mid-request. Denying it changes nothing for any healthy
 * read, so it carries no lockout risk and does not wait on the migration.
 *
 * `01…§14` `T-9` / `02…§18` `M2-12`: *"a transient read failure is indistinguishable from absence
 * and resolves the same way — so the fix must cover both, which is why `I-30` is stated in terms of
 * failure, not absence."*
 */
export function scopeAnswerForFailedProfileRead(): ScopeAnswer {
    return resolveScopeAnswerFromProfile(null, "deny");
}

/**
 * W-43 — a read that FAILED is recorded on its own channel, deliberately not
 * {@link logScopeDivergence}.
 *
 * That log is W-7's observation window: it is the evidence an operator will read to decide whether
 * flipping `ABSENT_PROFILE_ENFORCEMENT` is safe, and every line in it is supposed to mean "a
 * membership exists with no profile row". Emitting read failures there with
 * `reason=absent_profile_row` would inflate that count with events that are not that thing, and
 * corrupt the evidence base for a lockout-sensitive decision. Separate cause, separate channel.
 */
function logAccessReadFailure(
    where: string,
    table: string,
    userId: string,
    orgId: string | null,
    message: string
): void {
    console.error(
        `[access-identity][W-43][read-failure] where=${where} table=${table} user_id=${userId} ` +
            `org_id=${orgId ?? "unresolved"} outcome=deny reason=read_error message=${message}`
    );
}

/** Stable, greppable divergence record for W-7's observation window. Identifiers only — no free text. */
function logScopeDivergence(
    where: string,
    userId: string,
    orgId: string,
    enforced: ScopeAnswer,
    shadow: ScopeAnswer
): void {
    console.warn(
        `[access-identity][W-7][scope-divergence] where=${where} user_id=${userId} org_id=${orgId} ` +
            `enforced=${enforced.departmentScope}/${enforced.siteScope} ` +
            `shadow=${shadow.departmentScope}/${shadow.siteScope} reason=absent_profile_row`
    );
}

/**
 * Pure helper: primary org + role_keys[] for that org from membership rows.
 * Primary org rule — preserve CRM semantics:
 * - If any admin/ops rows exist, choose lexicographically smallest org_id among those rows only.
 * - Else choose smallest org_id among all membership rows (custom roles).
 */
export function chooseOrgAndRoleKeysFromMembershipRows(
    rows: { org_id: string; role: string }[]
): { orgId: string; roleKeys: string[] } | null {
    if (!rows?.length) return null;
    // W-42 — normalized before the membership is classified, not after. Comparing the RAW value
    // here was the enforcing half of `I-28`ᴬ: a row holding `"admin "` matched no portal role, so
    // the principal resolved `portalEligible: false` with an empty capability set while the preview
    // (which trimmed) showed a working portal administrator.
    const normalized = rows.map((r) => ({ org_id: r.org_id, role: normalizeRoleKey(r.role) })).filter((r) => r.role);
    if (!normalized.length) return null;
    const adminOpsRows = normalized.filter((r) => PORTAL_ROLES.has(r.role));
    const pool = adminOpsRows.length > 0 ? adminOpsRows : normalized;
    const chosenOrg = [...new Set(pool.map((r) => r.org_id))].sort()[0];
    if (!chosenOrg) return null;
    const roleKeys = [
        ...new Set(normalized.filter((r) => r.org_id === chosenOrg).map((r) => r.role)),
    ].sort();
    return roleKeys.length ? { orgId: chosenOrg, roleKeys } : null;
}

/**
 * **W-20 — the legacy fallback is gone.** `I-1`/`I-2`, lockout class `L4`.
 *
 * Three tables could make someone `admin` or `ops` — `user_profiles.role`, and `app_users.role`
 * joined on either of two columns because the linkage was itself ambiguous. Under the canonical
 * model exactly one source is legal, and this module used to consult the other two whenever
 * {@link chooseOrgAndRoleKeysFromMembershipRows} found no usable membership.
 *
 * **What made the deletion safe, and why it is evidence rather than confidence.** `W-0` established
 * that the lockout population was empty; the `Q15` census re-established it on the deployed tenant
 * on 2026-08-19, through the governed trusted-host path, and three questions agreed instead of one:
 *
 * - `Q15-A1` — principals who would lose all authority: **0**;
 * - `Q15-A2` and `Q15-A3` — legacy values that are redundant or stale: **0 and 0**, which is the
 *   stronger statement. It is not that every legacy value is backed by a canonical membership; the
 *   legacy columns hold no role for anyone;
 * - `Q15-A4` — principals reachable only through the fallback: **0**, and no legacy row lacking an
 *   org.
 *
 * So this deletion revokes nothing. §5: with the population at zero rather than merely small, W-20
 * *"collapses from the four-step ritual to a straight deletion plus its `RL-12` lock"* — there was
 * no one to migrate.
 *
 * **What went with it.** `M2-8`: `app_users.role` carries a `CHECK` constraint enumerating a fourth
 * role vocabulary, including `vendor_owner` and `vendor_worker`. `W-16`'s foreign key constrains
 * `user_roles.role` and does nothing about that column, because only the fallback read it. No
 * authority path reads it now, so the vocabulary is no longer on an authority path at all.
 *
 * `M2-5`: the copy in `resolveAdminPortalOrgCore` went in the same commit. Deleting the fallback
 * from one module and leaving the re-implementation serving `requireAdminOrOps` is the failure mode
 * `RL-12` is stated over *every* module to catch.
 */

/**
 * W-43 — returns `null` when the grant read FAILED, which is not the same answer as `[]`.
 *
 * `[]` is a legitimate result: a role may hold no grants. Collapsing a failed read onto it made the
 * failure **open** for the 131-of-132 surfaces that gate on admission alone — they never consult
 * `permissionKeys`, so an empty set costs them nothing and the caller sails through with authority
 * nobody verified. The caller now denies instead.
 */
async function fetchPermissionKeys(
    supabase: SupabaseClient,
    orgId: string,
    roleKeys: string[],
    where: string,
    userId: string
): Promise<string[] | null> {
    if (!roleKeys.length) return [];
    const { data, error } = await supabase
        .from("role_permission_grants")
        .select("permission_key")
        .eq("org_id", orgId)
        .in("role_key", roleKeys)
        .eq("allowed", true);
    if (error) {
        logAccessReadFailure(where, "role_permission_grants", userId, orgId, error.message);
        return null;
    }
    const keys = [...new Set((data ?? []).map((r) => (r as { permission_key: string }).permission_key).filter(Boolean))];
    return keys.sort();
}

/**
 * Resolve org, roles, grants, and scope dimensions for a user (service-role client).
 * Returns null when the user has no org membership and no legacy admin/ops path.
 */
export async function resolveAdminAccessCore(
    supabase: SupabaseClient,
    userId: string
): Promise<ResolvedAdminAccessCore | null> {
    const { data: urRows, error: urErr } = await supabase
        .from("user_roles")
        .select("org_id, role")
        .eq("user_id", userId);

    if (urErr) {
        console.error("[resolveAdminAccessCore] user_roles error:", urErr.message);
        return null;
    }

    const rows = Array.isArray(urRows)
        ? urRows.filter((r) => r && typeof (r as { org_id?: unknown }).org_id === "string" && typeof (r as { role?: unknown }).role === "string") as {
              org_id: string;
              role: string;
          }[]
        : [];

    // W-20 — membership is the single source of authority. No usable `user_roles` row is not a
    // reason to look somewhere else; it is the answer.
    const picked = chooseOrgAndRoleKeysFromMembershipRows(rows);
    if (!picked) return null;
    const { orgId, roleKeys } = picked;

    const portalEligible = roleKeys.some((r) => PORTAL_ROLES.has(r));
    const permissionKeys = await fetchPermissionKeys(
        supabase,
        orgId,
        roleKeys,
        "resolveAdminAccessCore",
        userId
    );
    // W-43 — a failed grant read denies rather than resolving to "no permissions", which most
    // surfaces cannot tell apart from a successful read of an unprivileged role.
    if (permissionKeys === null) return null;

    const { data: profileRow, error: profileErr } = await supabase
        .from("user_access_profiles")
        .select("department_scope, site_scope")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();

    // W-43 — this read's error was previously not destructured at all, which made a transient
    // failure indistinguishable from "no row" and therefore resolved it the widest possible way:
    // both scopes `all`. A failure now denies, and does NOT enter W-7's divergence window, because
    // it is not evidence about absent profile rows.
    let enforced: ScopeAnswer;
    if (profileErr) {
        logAccessReadFailure("resolveAdminAccessCore", "user_access_profiles", userId, orgId, profileErr.message);
        enforced = scopeAnswerForFailedProfileRead();
    } else {
        const dual = dualReadScopeAnswer(profileRow as ProfileScopeRow);
        enforced = dual.enforced;
        if (dual.diverges) logScopeDivergence("resolveAdminAccessCore", userId, orgId, enforced, dual.shadow);
    }

    const departmentScope: DepartmentScopeMode = enforced.departmentScope;
    const siteScope: SiteScopeMode = enforced.siteScope;

    let allowedDepartmentIds: string[] | null = null;
    if (enforced.denyAll) {
        allowedDepartmentIds = [];
    } else if (departmentScope === "restricted") {
        const { data: deptRows, error: deptErr } = await supabase
            .from("user_department_access")
            .select("department_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        if (deptErr) {
            console.error("[resolveAdminAccessCore] user_department_access error:", deptErr.message);
            allowedDepartmentIds = [];
        } else {
            allowedDepartmentIds = [...new Set((deptRows ?? []).map((r) => (r as { department_id: string }).department_id))];
        }
    }

    let allowedSiteLocationIds: string[] | null = null;
    if (enforced.denyAll) {
        allowedSiteLocationIds = [];
    } else if (siteScope === "restricted") {
        const { data: siteRows, error: siteErr } = await supabase
            .from("user_site_access")
            .select("location_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        if (siteErr) {
            console.error("[resolveAdminAccessCore] user_site_access error:", siteErr.message);
            allowedSiteLocationIds = [];
        } else {
            allowedSiteLocationIds = [...new Set((siteRows ?? []).map((r) => (r as { location_id: string }).location_id))];
        }
    }

    return {
        orgId,
        roleKeys,
        permissionKeys,
        departmentScope,
        allowedDepartmentIds,
        siteScope,
        allowedSiteLocationIds,
        portalEligible,
    };
}

/**
 * Scope dimensions for a specific `(user_id, org_id)` membership row — admin settings preview only.
 * Does not apply primary-org picking across multiple orgs.
 */
export async function resolveAdminAccessDimensionsForOrgMember(
    supabase: SupabaseClient,
    userId: string,
    orgId: string
): Promise<{
    roleKeys: string[];
    permissionKeys: string[];
    departmentScope: DepartmentScopeMode;
    siteScope: SiteScopeMode;
    allowedDepartmentIds: string[] | null;
    allowedSiteLocationIds: string[] | null;
    portalEligible: boolean;
} | null> {
    const { data: urRows, error: urErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", orgId);

    if (urErr || !urRows?.length) return null;

    // W-42 — the same normal form as the enforcing path, from the same function. A local `.trim()`
    // here is exactly what made preview and runtime disagree.
    const roleKeys = [
        ...new Set(urRows.map((r) => normalizeRoleKey((r as { role: unknown }).role)).filter(Boolean)),
    ].sort();
    if (!roleKeys.length) return null;

    const portalEligible = roleKeys.some((r) => PORTAL_ROLES.has(r));
    const permissionKeys = await fetchPermissionKeys(
        supabase,
        orgId,
        roleKeys,
        "resolveAdminAccessDimensionsForOrgMember",
        userId
    );
    // W-43 — as the enforcement path. The preview denies on a failed grant read too: a preview that
    // stays readable when enforcement has denied is the divergence this pair exists to prevent.
    if (permissionKeys === null) return null;

    const { data: profileRow, error: profileErr } = await supabase
        .from("user_access_profiles")
        .select("department_scope, site_scope")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();

    // Same instrument and the SAME constant as the enforcement path above: this is the admin
    // settings preview, and if it kept its own fallback the switch would leave displayed authority
    // reading `all` while actual authority denied. Behaviour is unchanged today — both read
    // ABSENT_PROFILE_ENFORCEMENT, so both flip together.
    //
    // W-43 applies to this resolver for the same reason: a read failure here would render
    // "All locations · All departments" on the very surface the mission requires to stop
    // manufacturing that claim.
    let enforced: ScopeAnswer;
    if (profileErr) {
        logAccessReadFailure(
            "resolveAdminAccessDimensionsForOrgMember",
            "user_access_profiles",
            userId,
            orgId,
            profileErr.message
        );
        enforced = scopeAnswerForFailedProfileRead();
    } else {
        const dual = dualReadScopeAnswer(profileRow as ProfileScopeRow);
        enforced = dual.enforced;
        if (dual.diverges) {
            logScopeDivergence("resolveAdminAccessDimensionsForOrgMember", userId, orgId, enforced, dual.shadow);
        }
    }

    const departmentScope: DepartmentScopeMode = enforced.departmentScope;
    const siteScope: SiteScopeMode = enforced.siteScope;

    let allowedDepartmentIds: string[] | null = null;
    if (enforced.denyAll) {
        allowedDepartmentIds = [];
    } else if (departmentScope === "restricted") {
        const { data: deptRows, error: deptErr } = await supabase
            .from("user_department_access")
            .select("department_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        if (deptErr) {
            console.error("[resolveAdminAccessDimensionsForOrgMember] user_department_access error:", deptErr.message);
            allowedDepartmentIds = [];
        } else {
            allowedDepartmentIds = [...new Set((deptRows ?? []).map((r) => (r as { department_id: string }).department_id))];
        }
    }

    let allowedSiteLocationIds: string[] | null = null;
    if (enforced.denyAll) {
        allowedSiteLocationIds = [];
    } else if (siteScope === "restricted") {
        const { data: siteRows, error: siteErr } = await supabase
            .from("user_site_access")
            .select("location_id")
            .eq("user_id", userId)
            .eq("org_id", orgId);
        if (siteErr) {
            console.error("[resolveAdminAccessDimensionsForOrgMember] user_site_access error:", siteErr.message);
            allowedSiteLocationIds = [];
        } else {
            allowedSiteLocationIds = [...new Set((siteRows ?? []).map((r) => (r as { location_id: string }).location_id))];
        }
    }

    return {
        roleKeys,
        permissionKeys,
        departmentScope,
        siteScope,
        allowedDepartmentIds,
        allowedSiteLocationIds,
        portalEligible,
    };
}

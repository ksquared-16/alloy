/**
 * W-56 / `T-22`, `S-11` — an authority set that failed to load is UNKNOWN, never EMPTY.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §46 (Wave 13).
 *
 * **The defect.** `AccessRolesConfigurationPage` read a role's permission grants and, on both the
 * `!res.ok` and the `catch` path, called `setGrantKeys(new Set())` and returned **without setting an
 * error**. The Permissions tab then rendered a legitimate-looking all-*None* grid, and Save `PUT`s
 * the set it is holding — which `PUT /api/admin/rbac/grants` implements as `DELETE` every grant row
 * for `(org_id, role_key)` followed by an insert that is skipped when the list is empty. So a
 * transient read failure became a **silent total revocation** of the role's capabilities on the next
 * Save. `01…§52` records it as *"the only S3 in this pass that the simplification pass can close
 * incidentally, and leaving it in place while rewriting the surface around it would be the worst
 * outcome."*
 *
 * **Why it is worse than when the plan priced it.** Before W-13/`AD-22` (session 8),
 * `canManageUsersAndRoles` opened with `if (access.roleKeys.includes("admin")) return true`, so an
 * operator who wiped the `admin` role's grants still reached the Access surface by role literal and
 * could put them back. That literal is now gone — correctly — and the gate reads
 * `permissionKeys.includes("settings.users_roles")` and nothing else. Wiping the `admin` role's
 * grants therefore revokes the capability that admits the operator to the surface **and** to the
 * `PUT` route that would restore it. There is no in-product recovery; it takes a migration. Removing
 * the bypass was right, and it converted this defect from data loss into a lockout.
 *
 * **The fix is representational, not defensive.** A `Set<string>` cannot distinguish "this role has
 * no grants" from "we do not know what grants this role has", so no amount of care at the call site
 * can keep the two apart — the type has already lost the fact. This module gives the load an
 * explicit state, and makes "may this be written?" a question with one answer rather than a
 * condition each save path re-derives.
 *
 * Pure functions only. The guard must be answerable in a test without a component, because
 * `IA-7`'s lesson in this same chapter is that a `disabled` attribute is a presentation fact and the
 * refusal has to sit in front of the write.
 */

/** The three states a fetched authority set can be in. `loading` and `failed` are both NOT-KNOWN. */
export type AuthoritySetLoad =
    | { status: "loading" }
    | { status: "loaded"; keys: ReadonlySet<string> }
    | { status: "failed"; error: string };

/** The initial state. Named rather than inlined so no surface starts life at `loaded` with nothing. */
export const AUTHORITY_SET_LOADING: AuthoritySetLoad = { status: "loading" };

/** A successful read. */
export function authoritySetLoaded(keys: Iterable<string>): AuthoritySetLoad {
    const set = new Set<string>();
    for (const key of keys) {
        if (typeof key !== "string") continue;
        const trimmed = key.trim();
        if (trimmed) set.add(trimmed);
    }
    return { status: "loaded", keys: set };
}

/**
 * A failed read.
 *
 * The message is normalized to a non-empty string because an error state whose message is `""`
 * renders as no error at all, which reintroduces the silence this state exists to break.
 */
export function authoritySetFailed(error: unknown): AuthoritySetLoad {
    const message =
        error instanceof Error && error.message.trim()
            ? error.message.trim()
            : typeof error === "string" && error.trim()
              ? error.trim()
              : "The current permissions for this role could not be loaded.";
    return { status: "failed", error: message };
}

/**
 * The keys to display, and **only** to display.
 *
 * Returns an empty set for a not-known load, because a grid has to render something. That is safe
 * only because {@link authoritySetIsWritable} refuses the save independently — a caller that renders
 * from this and saves from this without asking the guard has rebuilt the defect. `S-11`'s Tier A
 * lock exists to catch exactly that.
 */
export function authoritySetKeysForDisplay(load: AuthoritySetLoad): ReadonlySet<string> {
    return load.status === "loaded" ? load.keys : new Set<string>();
}

/** May the set this load produced be written back? Only a completed, successful read may. */
export function authoritySetIsWritable(load: AuthoritySetLoad): boolean {
    return load.status === "loaded";
}

/**
 * Why the write is refused, or `null` when it is permitted.
 *
 * Distinguishes the two not-known states, because they call for different operator action: a
 * `loading` set will resolve on its own, a `failed` one needs a reload.
 */
export function authoritySetWriteRefusal(load: AuthoritySetLoad): string | null {
    if (load.status === "loaded") return null;
    if (load.status === "loading") {
        return "The current permissions for this role are still loading. Saving now would overwrite them.";
    }
    return `${load.error} Saving now would replace this role's permissions with an empty set. Reload before changing anything.`;
}

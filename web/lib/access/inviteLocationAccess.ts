/**
 * Location access, collected at invite.
 *
 * **The problem this solves.** `PATCH /api/admin/users/[userId]/access-scope` takes a WHOLE scope —
 * department and site together — and refuses a `restricted` dimension with an empty allow-list. So a
 * surface that wants to set only *where a person may work* has to supply a department answer it did
 * not ask for. Choosing one carelessly is how a screen quietly grants or removes authority.
 *
 * **The answer is derived, not chosen.** A newly invited account has no access profile, and
 * `ABSENT_PROFILE_ENFORCEMENT` decides what that means. Today it is `legacy-all`: no profile is
 * enforced as all departments and all locations. Writing `department_scope: "all"` therefore changes
 * nothing about what the account can reach — it records the state the platform is already enforcing.
 *
 * If that constant ever becomes `deny`, the same write would be a real widening, and this module
 * stops producing a payload rather than performing it. That is the whole point of deriving it:
 * `inviteLocationAccess.test.ts` runs both modes, so the day the platform's default flips, the
 * invite flow narrows itself instead of silently handing out every department.
 *
 * Departments are not offered here. `OD-8`'s tranche keeps them out of the V1 Access configuration
 * experience, and an existing restriction is a property of an existing account — an invite has no
 * account yet, so there is nothing to preserve and nothing to hide.
 */
import { ABSENT_PROFILE_ENFORCEMENT, resolveScopeAnswerFromProfile } from "@/lib/admin/resolveAdminAccessCore";

/** What "no access profile" is enforced as right now, for each dimension. */
export const ABSENT_PROFILE_ANSWER = resolveScopeAnswerFromProfile(null, ABSENT_PROFILE_ENFORCEMENT);

/** The operator's choice on the invite form. There is no third state: the form requires an answer. */
export type InviteSiteMode = "all" | "restricted";

export type InviteScopePayload = {
    department_scope: "all" | "restricted";
    site_scope: "all" | "restricted";
    department_ids: string[];
    site_location_ids: string[];
};

/**
 * The body to PATCH after an invite succeeds, or `null` when writing one would assert something the
 * operator was never asked.
 *
 * `null` in two cases, both of which the caller must surface rather than swallow:
 *
 * 1. *Selected locations* with nothing selected. The route rejects it, and it would mean "no
 *    locations", which is not what an operator who has not finished choosing intends.
 * 2. The absent-profile default is not `all` for departments. Then a profile cannot be created
 *    without either restricting departments to a list nobody chose, or opening every department
 *    beyond what absence already grants.
 */
export function inviteScopePayload(input: {
    siteMode: InviteSiteMode;
    siteLocationIds: readonly string[];
}): InviteScopePayload | null {
    if (ABSENT_PROFILE_ANSWER.departmentScope !== "all" || ABSENT_PROFILE_ANSWER.denyAll) return null;

    const ids = [...new Set(input.siteLocationIds.map((id) => id.trim()).filter(Boolean))];
    if (input.siteMode === "restricted" && ids.length === 0) return null;

    return {
        department_scope: "all",
        site_scope: input.siteMode,
        department_ids: [],
        site_location_ids: input.siteMode === "restricted" ? ids : [],
    };
}

/**
 * Whether the invite form may be submitted with this location answer.
 *
 * Deliberately independent of {@link inviteScopePayload}'s second refusal: if the platform's
 * absent-profile default changes, the invite must still be able to CREATE A USER. It just cannot
 * also set their scope, and the form says so instead of blocking the invitation.
 */
export function inviteSiteSelectionIsComplete(input: {
    siteMode: InviteSiteMode;
    siteLocationIds: readonly string[];
}): boolean {
    return input.siteMode === "all" || input.siteLocationIds.some((id) => id.trim().length > 0);
}

/**
 * What to tell the operator about the scope this invite will record.
 *
 * The sentence is generated from the same values the payload is, so the screen cannot describe one
 * outcome while the request performs another.
 */
export function inviteScopeNote(input: { siteMode: InviteSiteMode; siteLocationCount: number }): string {
    if (ABSENT_PROFILE_ANSWER.departmentScope !== "all" || ABSENT_PROFILE_ANSWER.denyAll) {
        return "Location access cannot be set from here for this organization — set it on the user after inviting.";
    }
    const where =
        input.siteMode === "all" ? "every location"
        : input.siteLocationCount === 1 ? "1 selected location"
        : `${input.siteLocationCount} selected locations`;
    return `This person will be able to work at ${where}. Departments are not restricted.`;
}

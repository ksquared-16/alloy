/**
 * Location access, collected at invite — and written WITH the invitation, not after it.
 *
 * **What an invited account holds.** The invitation creates the membership through the membership
 * owner, which writes the access profile in the same transaction: all departments and all locations
 * (`create_membership_with_access_profile`), or all departments and the selected locations
 * (`create_membership_with_access_scope`, which composes that owner with the audited scope owner).
 * Since migration 20261126090000 every membership has a profile, so what an account can reach is its
 * profile — never `ABSENT_PROFILE_ENFORCEMENT`, which no longer has anyone to apply to. This module
 * used to derive its department answer from that constant; under `deny` it then refused to produce a
 * payload at all, and the operator's location choice was silently dropped.
 *
 * **Why the choice travels with the invite.** It used to be a second request to the access-scope route
 * after the account existed. When that request failed — or the inviter lacked the scope capability —
 * an operator who chose "Selected locations" left behind an account with organization-wide access.
 *
 * Departments are not offered here. `OD-8`'s tranche keeps them out of the V1 Access configuration
 * experience, so an invited account's departments are always "all", as the membership owner writes.
 */

/** The operator's choice on the invite form. There is no third state: the form requires an answer. */
export type InviteSiteMode = "all" | "restricted";

/** The location fields of the invite request (`POST /api/admin/users`). */
export type InviteScopePayload = {
    site_scope: "all" | "restricted";
    site_location_ids: string[];
};

/**
 * The location fields to send with the invitation, or `null` when the answer is not finished:
 * *Selected locations* with nothing selected would mean "no locations", which is not what an operator
 * who has not finished choosing intends — and the server refuses an empty restriction anyway.
 */
export function inviteScopePayload(input: {
    siteMode: InviteSiteMode;
    siteLocationIds: readonly string[];
}): InviteScopePayload | null {
    const ids = [...new Set(input.siteLocationIds.map((id) => id.trim()).filter(Boolean))];
    if (input.siteMode === "restricted" && ids.length === 0) return null;
    return {
        site_scope: input.siteMode,
        site_location_ids: input.siteMode === "restricted" ? ids : [],
    };
}

/** Whether the invite form may be submitted with this location answer. */
export function inviteSiteSelectionIsComplete(input: {
    siteMode: InviteSiteMode;
    siteLocationIds: readonly string[];
}): boolean {
    return inviteScopePayload(input) !== null;
}

/**
 * What to tell the operator about the access this invite will record — generated from the same
 * values the request carries, so the screen cannot describe one outcome while the request performs
 * another.
 */
export function inviteScopeNote(input: { siteMode: InviteSiteMode; siteLocationCount: number }): string {
    const where =
        input.siteMode === "all" ? "every location"
        : input.siteLocationCount === 1 ? "1 selected location"
        : `${input.siteLocationCount} selected locations`;
    return `This person will be able to work at ${where}. Departments are not restricted.`;
}

/**
 * W14-F1 (disclosure half) — the operational roster stops handing every portal-admitted principal
 * the organisation's email list.
 *
 * `GET /api/admin/users` is admitted by portal eligibility alone, and returns one row per org
 * member. `w14-declared-route-capability-table.json` recorded that as a finding and declined to
 * answer it, because *asserting* that a roster read requires no capability is a product decision
 * (`W-15`). This module does not answer that question either — admission is untouched.
 *
 * What it separates is **reach** from **projection**. The route's live consumers want two
 * different things from one payload:
 *
 *   - `components/admin/opportunity/OperationalWorkAssigneeSelect.tsx` needs a way to *name* a
 *     colleague in an assignee dropdown. It derived that name by taking the local-part of the
 *     address client-side — so the full address crossed the wire purely to be discarded.
 *   - the Access and legacy administration surfaces need the address itself, and their callers
 *     hold `settings.users_roles`.
 *
 * So the label is computed here, for everyone, and the address is withheld from callers who do not
 * hold the managing capability. No consumer loses a function it had; the org's address list stops
 * being readable by anyone merely admitted to the portal.
 *
 * This is the platform rule in its intended direction — presentation reflects authorization;
 * presentation does not create authorization. `mayReadMemberEmail` is the same predicate the
 * managing routes enforce (`canManageUsersAndRoles`), read a second time, not a second predicate
 * that presently agrees with it.
 */

/**
 * A human-readable name for a member, safe to show to any principal already admitted to the
 * portal — it is what the assignee picker already displayed to exactly those principals.
 *
 * Falls back to a user-id fragment when no address is readable, which is what the picker's own
 * derivation did. Local-parts are not guaranteed unique across domains; a roster holding
 * `j@a.example` and `j@b.example` renders `j` twice. That collision is pre-existing in the
 * fallback path and is a naming problem (`W-36`'s display-name source), not a disclosure one.
 */
export function memberDirectoryLabel(email: string | null, userId: string): string {
    const trimmed = email?.trim();
    if (trimmed) {
        const at = trimmed.indexOf("@");
        return at > 0 ? trimmed.slice(0, at) : trimmed;
    }
    return userId.slice(0, 8);
}

/**
 * The address itself, or `null` when the caller may not read it.
 *
 * `null` is already in `AdminUserRow`'s contract — a member whose auth record cannot be read has
 * always projected `null` here — so withholding introduces no new shape for consumers to handle.
 * It does mean `null` carries two meanings at once: *not readable by this caller* and *no address
 * on record*. Callers that must tell those apart hold the capability, and for them the value is
 * never withheld.
 */
export function projectMemberEmail(email: string | null, mayReadEmail: boolean): string | null {
    if (!mayReadEmail) return null;
    const trimmed = email?.trim();
    return trimmed ? trimmed : null;
}

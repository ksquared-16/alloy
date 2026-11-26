/**
 * Which person is this session?
 *
 * Attendance authorization is keyed on `auth.users.id`. Staff operational
 * assignments are keyed on `persons.id`. Nothing joined them, so "may this
 * teacher capture attendance in this room" had no way to be asked: the session
 * knew a user, the assignment knew a person, and the authority decision lives in
 * the gap between the two.
 *
 * This is that join, and deliberately nothing more. It resolves an authenticated
 * user to the canonical person that human IS, through an explicit link an
 * operator created. It is not an identity provider, not account lifecycle, and
 * not customer authentication — that remains unsolved.
 *
 * ── IDENTITY IS NEVER INFERRED ──
 *
 * There is no email fallback here and there must never be one. `web/lib/identity`
 * next door exists to GUESS which records describe the same human, with
 * confidence bands and candidate scores, and it is right for merging duplicate
 * contacts. It is exactly wrong for deciding authority: email is mutable, unique
 * by no constraint in this schema, and shared in practice. A wrong guess either
 * locks out a real teacher or hands one teacher another person's assignments,
 * and neither announces itself. So this module lives beside
 * `actorPermissionGrants`, with the other things that answer authority questions,
 * rather than beside the matchers.
 *
 * ── UNRESOLVED IS NOT UNPRIVILEGED ──
 *
 * A failed read returns `null` for the person AND records that the lookup could
 * not be trusted, so callers deny rather than treating a broken query as "this
 * user is nobody". Same shape `resolveActorPermissionGrants` uses for the same
 * reason.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type LinkedPersonResolution = {
    /** The canonical person, or null when no active link exists. */
    personId: string | null;
    /**
     * False when the lookup itself failed. `personId` is null either way, but
     * only this distinguishes "nobody is linked" from "we could not tell",
     * and only the first is a safe basis for a deliberate denial message.
     */
    resolved: boolean;
};

const UNRESOLVED: LinkedPersonResolution = { personId: null, resolved: false };
const NOT_LINKED: LinkedPersonResolution = { personId: null, resolved: true };

/**
 * The canonical person behind an authenticated user, within one org.
 *
 * Org-scoped on purpose: the same human may exist as a person in more than one
 * organization, and a link is only ever meaningful inside the org that made it.
 */
export async function resolveLinkedPersonId(
    supabase: SupabaseClient,
    orgId: string,
    userId: string | null | undefined,
): Promise<LinkedPersonResolution> {
    const user = (userId ?? "").trim();
    const org = (orgId ?? "").trim();
    // An unidentified caller is not an unlinked one. Refuse to answer.
    if (!user || !org) return UNRESOLVED;

    const { data, error } = await supabase
        .from("user_person_links")
        .select("person_id")
        .eq("org_id", org)
        .eq("user_id", user)
        .eq("status", "active")
        .limit(1);

    if (error) return UNRESOLVED;

    const rows = (data ?? []) as unknown as Array<{ person_id?: unknown }>;
    if (rows.length === 0) return NOT_LINKED;

    const personId = rows[0]?.person_id != null ? String(rows[0].person_id).trim() : "";
    if (!personId) return UNRESOLVED;

    return { personId, resolved: true };
}

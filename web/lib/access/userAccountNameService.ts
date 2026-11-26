/**
 * W7-F002 (corrected) — A LOGIN'S OWN NAME, EDITED IN ACCESS.
 *
 * Two identities, never collapsed:
 *
 *   USER / LOGIN   who authenticated and operated Alloy. Its human name lives on the account
 *                  (auth user metadata `full_name`), which is what invite already writes.
 *   PERSON         the business record in Alloy. A login MAY be linked to one; it need not be.
 *
 * An organisation that does not manage staff as Persons still has accountable humans operating it,
 * so the login itself must be nameable. This is the governed edit of that name: authorised by the
 * same capability that administers users, scoped to a login that belongs to this organisation, and
 * recorded as an access mutation event with who changed it from what to what.
 *
 * It writes ONLY the account name. It never touches the email, never creates a Person and never
 * links or unlinks one. An email address is refused as a name — it is a login, not a human name.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export class UserAccountNameError extends Error {
    constructor(
        public readonly code:
            | "invalid_name"
            | "name_is_an_email"
            | "user_not_in_org"
            | "user_not_found"
            | "write_failed"
            | "audit_failed",
        message: string,
        public readonly status: number,
    ) {
        super(message);
    }
}

/** A usable account name, or a refusal. Whitespace collapsed; 2–120 characters; never an email. */
export function normaliseAccountName(raw: unknown): string {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 120) {
        throw new UserAccountNameError("invalid_name", "Enter a name of 2 to 120 characters.", 400);
    }
    if (/@/.test(name)) {
        throw new UserAccountNameError(
            "name_is_an_email",
            "An email address is not a name. Enter the person's name as it should appear in the audit trail.",
            400,
        );
    }
    return name;
}

export async function updateUserAccountName(
    supabase: SupabaseClient,
    args: { orgId: string; actorUserId: string; targetUserId: string; name: unknown; correlationId?: string },
): Promise<{ userId: string; name: string; previousName: string | null; changed: boolean }> {
    const name = normaliseAccountName(args.name);
    const targetUserId = String(args.targetUserId ?? "").trim();

    /* The login must belong to THIS organisation: an admin of one tenant never renames another's user. */
    const { data: membership, error: membershipError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("org_id", args.orgId)
        .eq("user_id", targetUserId)
        .limit(1);
    if (membershipError) throw new UserAccountNameError("write_failed", membershipError.message, 500);
    if (!membership || membership.length === 0) {
        throw new UserAccountNameError("user_not_in_org", "That user is not a member of this organisation.", 404);
    }

    const { data: got, error: getError } = await supabase.auth.admin.getUserById(targetUserId);
    if (getError || !got?.user) throw new UserAccountNameError("user_not_found", "That user could not be found.", 404);
    const metadata = (got.user.user_metadata ?? {}) as Record<string, unknown>;
    const previousName =
        (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
        (typeof metadata.name === "string" && metadata.name.trim()) ||
        null;
    if (previousName === name) return { userId: targetUserId, name, previousName, changed: false };

    /* Only the name changes; every other metadata key, and the email, are left exactly as they were. */
    const { error: updateError } = await supabase.auth.admin.updateUserById(targetUserId, {
        user_metadata: { ...metadata, full_name: name },
    });
    if (updateError) throw new UserAccountNameError("write_failed", updateError.message, 500);

    const { error: auditError } = await supabase.from("mutation_events").insert({
        org_id: args.orgId,
        command_key: "access.user.account_name_changed",
        domain: "access",
        subject_id: targetUserId,
        subject_type: "membership",
        previous_state: previousName ?? "",
        new_state: name,
        operator_id: args.actorUserId,
        origin: "operator",
        context_payload: {
            user_id: targetUserId,
            before_name: previousName,
            after_name: name,
            person_link_changed: false,
            correlation_id: args.correlationId ?? null,
        },
    });
    if (auditError) {
        throw new UserAccountNameError(
            "audit_failed",
            `The name was saved, but the change could not be recorded in the access history: ${auditError.message}`,
            500,
        );
    }
    return { userId: targetUserId, name, previousName, changed: true };
}

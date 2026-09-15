/**
 * W-5 / G4 — the single application seam for creating org membership.
 *
 * A membership row (`user_roles`) and its access profile (`user_access_profiles`)
 * MUST be written in one transaction. Two Supabase calls are two transactions,
 * so every membership-creating path routes through these RPCs instead of
 * inserting into `user_roles` directly. Adding a direct insert elsewhere
 * re-opens G4 and lets W-0 Q4 grow again.
 *
 * New profiles are created at `department_scope = 'all'`, `site_scope = 'all'` —
 * exactly what `resolveAdminAccessCore` infers today when the row is absent, so
 * this changes no principal's effective access.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessMutationAudit } from "@/lib/access/accessMutationAudit";

export type MembershipRow = {
    user_id: string;
    org_id: string;
    role: string;
    created_at?: string;
};

export type MembershipWriteResult =
    | { ok: true; row: MembershipRow }
    | { ok: false; kind: "duplicate" | "not_found" | "forbidden" | "error"; error: string };

/** Postgres SQLSTATEs the RPCs use to signal caller-mappable outcomes. */
const UNIQUE_VIOLATION = "23505";
const NO_DATA_FOUND = "P0002";

function classify(code: string | undefined, message: string): MembershipWriteResult {
    if (code === UNIQUE_VIOLATION) return { ok: false, kind: "duplicate", error: message };
    if (code === NO_DATA_FOUND) return { ok: false, kind: "not_found", error: message };
    /*
     * The assignment ceiling, surfaced as authorization rather than as a fault. Creating a member
     * with an initial role is a delegation, so a refusal here is 403 and says which authority the
     * actor could not confer — not a 500 that reads as a broken server.
     */
    const beyond = message.match(/assignment_ceiling:([^\s"]+)/);
    if (beyond) {
        return {
            ok: false,
            kind: "forbidden",
            error:
                "You can only give someone access you hold yourself. Not assigned: "
                + beyond[1].split(",").join(", "),
        };
    }
    return { ok: false, kind: "error", error: message };
}

/**
 * Add a membership and guarantee its access profile, atomically.
 * `duplicate` means the (user, org, role) membership already exists.
 *
 * **The actor is the delegation ceiling's subject, not audit decoration.** Creating a member with an
 * initial role confers that role's whole package, which is why "create a user, give them admin" was
 * the bypass around W-18's grant ceiling: the RPC took no actor at all and so could not be bounded.
 * It now refuses an unattributed creation in any organization that already has a member, and bounds
 * an attributed one to the actor's own authority.
 *
 * `actor` is optional ONLY for genuine bootstrap — the first membership of a freshly created
 * organization, which is the one case the RPC recognises structurally rather than on a caller's word.
 */
export async function createMembershipWithAccessProfile(
    supabase: SupabaseClient,
    params: { userId: string; orgId: string; role: string; audit?: AccessMutationAudit }
): Promise<MembershipWriteResult> {
    const { data, error } = await supabase.rpc("create_membership_with_access_profile", {
        p_user_id: params.userId,
        p_org_id: params.orgId,
        p_role: params.role,
        p_actor_user_id: params.audit?.actorUserId ?? null,
    });

    if (error) return classify(error.code, error.message);
    const row = (Array.isArray(data) ? data[0] : data) as MembershipRow | null;
    if (!row) return { ok: false, kind: "error", error: "Membership RPC returned no row" };
    return { ok: true, row };
}

/**
 * Replace every role row for (user, org) with a single role and guarantee the
 * access profile, atomically. `not_found` means the pair holds no membership.
 */
export async function replaceMembershipWithAccessProfile(
    supabase: SupabaseClient,
    params: {
        userId: string;
        orgId: string;
        role: string;
        /**
         * D2 — who is changing this membership. The RPC refuses a change that names no actor, so
         * this is not optional metadata: without it the replacement does not happen.
         */
        audit: AccessMutationAudit;
    }
): Promise<MembershipWriteResult> {
    const { data, error } = await supabase.rpc("replace_membership_with_access_profile", {
        p_user_id: params.userId,
        p_org_id: params.orgId,
        p_role: params.role,
        p_actor_user_id: params.audit.actorUserId,
        p_origin: params.audit.origin,
        p_correlation_id: params.audit.correlationId,
    });

    if (error) return classify(error.code, error.message);
    const row = (Array.isArray(data) ? data[0] : data) as MembershipRow | null;
    if (!row) return { ok: false, kind: "error", error: "Membership RPC returned no row" };
    return { ok: true, row };
}

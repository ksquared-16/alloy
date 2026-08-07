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

export type MembershipRow = {
    user_id: string;
    org_id: string;
    role: string;
    created_at?: string;
};

export type MembershipWriteResult =
    | { ok: true; row: MembershipRow }
    | { ok: false; kind: "duplicate" | "not_found" | "error"; error: string };

/** Postgres SQLSTATEs the RPCs use to signal caller-mappable outcomes. */
const UNIQUE_VIOLATION = "23505";
const NO_DATA_FOUND = "P0002";

function classify(code: string | undefined, message: string): MembershipWriteResult {
    if (code === UNIQUE_VIOLATION) return { ok: false, kind: "duplicate", error: message };
    if (code === NO_DATA_FOUND) return { ok: false, kind: "not_found", error: message };
    return { ok: false, kind: "error", error: message };
}

/**
 * Add a membership and guarantee its access profile, atomically.
 * `duplicate` means the (user, org, role) membership already exists.
 */
export async function createMembershipWithAccessProfile(
    supabase: SupabaseClient,
    params: { userId: string; orgId: string; role: string }
): Promise<MembershipWriteResult> {
    const { data, error } = await supabase.rpc("create_membership_with_access_profile", {
        p_user_id: params.userId,
        p_org_id: params.orgId,
        p_role: params.role,
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
    params: { userId: string; orgId: string; role: string }
): Promise<MembershipWriteResult> {
    const { data, error } = await supabase.rpc("replace_membership_with_access_profile", {
        p_user_id: params.userId,
        p_org_id: params.orgId,
        p_role: params.role,
    });

    if (error) return classify(error.code, error.message);
    const row = (Array.isArray(data) ? data[0] : data) as MembershipRow | null;
    if (!row) return { ok: false, kind: "error", error: "Membership RPC returned no row" };
    return { ok: true, row };
}

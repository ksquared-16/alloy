import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccessMutationAudit } from "@/lib/access/accessMutationAudit";

/**
 * The two additive membership-role operations, at their audited transaction owner.
 *
 * ── WHY NOT "READ THE SET, CHANGE ONE, WRITE IT BACK" ──
 *
 * That shape is lost-update shaped. Two administrators adding different roles in the same moment
 * each compute a set that never contained the other's addition, and whichever commits second erases
 * the first without either of them being told. `user_roles` is a join table keyed
 * (user_id, org_id, role), so a targeted insert and a targeted delete cannot collide with an
 * unrelated sibling at all, and the primary key arbitrates the one collision that does exist.
 *
 * The RPCs own the transaction for the same reason every other Access mutation does: the row change
 * and its `mutation_events` row commit together or not at all. A route that wrote the row and then
 * "best effort" recorded the history would be able to change someone's access with no record of it.
 */
export type MemberRoleWriteResult =
    | { ok: true; roleKey: string; changed: boolean; roleKeys: string[] }
    | { ok: false; kind: "unknown_role" | "error"; error: string };

type Args = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    roleKey: string;
    audit: AccessMutationAudit;
};

async function heldRoleKeys(supabase: SupabaseClient, orgId: string, userId: string): Promise<string[]> {
    const { data } = await supabase.from("user_roles").select("role").eq("org_id", orgId).eq("user_id", userId);
    return [...new Set(((data ?? []) as { role: string }[]).map((r) => String(r.role).trim()).filter(Boolean))].sort();
}

async function callRoleRpc(fn: "assign_member_role_audited" | "remove_member_role_audited", args: Args): Promise<MemberRoleWriteResult> {
    const { supabase, orgId, userId, roleKey, audit } = args;
    const { data, error } = await supabase.rpc(fn, {
        p_org_id: orgId,
        p_user_id: userId,
        p_role_key: roleKey,
        p_actor_user_id: audit.actorUserId,
        p_origin: audit.origin,
        p_correlation_id: audit.correlationId,
    });

    if (error) {
        // The FK (org_id, role) -> role_definitions(org_id, role_key) is what makes another
        // organization's role unreachable; the producer turns that into a named refusal rather than
        // letting a constraint string reach the operator.
        if (/unknown_role_key/i.test(error.message)) {
            return { ok: false, kind: "unknown_role", error: "Invalid or inactive role for this org" };
        }
        return { ok: false, kind: "error", error: error.message };
    }

    const row = (Array.isArray(data) ? data[0] : data) as { changed?: boolean } | null;
    return {
        ok: true,
        roleKey,
        // `changed: false` is a truthful no-op — the role was already held, or was not held at all —
        // and the producer deliberately wrote no history for it.
        changed: Boolean(row?.changed),
        roleKeys: await heldRoleKeys(supabase, orgId, userId),
    };
}

/** Add one role to a membership, leaving every other role it holds untouched. */
export function assignMemberRole(args: Args): Promise<MemberRoleWriteResult> {
    return callRoleRpc("assign_member_role_audited", args);
}

/**
 * Remove exactly one role from a membership.
 *
 * Removing the last one is NOT removing the person: `user_access_profiles` has no foreign key to
 * `user_roles`, so the membership and its configured scope survive an empty role set. The principal
 * simply resolves to no capabilities. Ending a membership stays its own, separately audited action.
 */
export function removeMemberRole(args: Args): Promise<MemberRoleWriteResult> {
    return callRoleRpc("remove_member_role_audited", args);
}

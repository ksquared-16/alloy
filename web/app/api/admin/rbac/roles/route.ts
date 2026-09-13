import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requirePortalOrUsersRolesManageAuth, requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";
import { invalidateAdminShellContextCache } from "@/lib/adminV2/adminShellContextCache";
import { accessMutationAudit } from "@/lib/access/accessMutationAudit";
import { type RoleDefinitionRow } from "@/lib/admin/defaultRoleDefinitions";

/**
 * GET: list roles for org. Portal (admin/ops) or Users & Roles managers.
 *
 * **W-61.** Every role in this response has a persisted `role_definitions` row. The response
 * used to be passed through `mergeRoleDefinitionsWithDefaults`, which fabricated any missing
 * member of a hard-coded four-role constant; see `@/lib/admin/defaultRoleDefinitions` for why
 * that was removed and why removing it changes no org's role list. The database orders by
 * `is_system` then `role_label`, which is the order the merge used to impose.
 */
export async function GET() {
    const auth = await requirePortalOrUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { orgId } = auth.access;

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("role_definitions")
        .select("role_key, role_label, is_system, is_active, created_at")
        .eq("org_id", orgId)
        .order("is_system", { ascending: false })
        .order("role_label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const roles: RoleDefinitionRow[] = (rows ?? []).map((r) => ({
        role_key: (r as { role_key: string }).role_key,
        role_label: (r as { role_label: string }).role_label,
        is_system: (r as { is_system: boolean }).is_system,
        is_active: (r as { is_active: boolean }).is_active,
        created_at: (r as { created_at?: string }).created_at ?? null,
    }));

    return NextResponse.json({ roles });
}

/** POST: create role. Requires org admin or `settings.users_roles` permission. */
export async function POST(request: NextRequest) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { orgId } = auth.access;

    let body: { role_key?: string; role_label?: string } = {};
    try {
        body = (await request.json()) as { role_key?: string; role_label?: string };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rawKey = typeof body.role_key === "string" ? body.role_key.trim() : "";
    const role_key = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || null;
    const role_label = typeof body.role_label === "string" ? body.role_label.trim() || null : null;

    if (!role_key) {
        return NextResponse.json({ error: "role_key is required and must be a valid slug" }, { status: 400 });
    }
    if (!role_label) {
        return NextResponse.json({ error: "role_label is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existing } = await supabase
        .from("role_definitions")
        .select("role_key")
        .eq("org_id", orgId)
        .eq("role_key", role_key)
        .maybeSingle();

    if (existing) {
        return NextResponse.json({ error: "Role key already exists in this org" }, { status: 409 });
    }

    // D2 — role creation moved to a transaction owner so the role row and its audit event commit
    // together. The route previously wrote a single statement, which is atomic alone and cannot be
    // atomic WITH an event.
    const audit = accessMutationAudit(auth.access);
    const { data: created, error } = await supabase
        .rpc("create_role_definition_audited", {
            p_org_id: orgId,
            p_role_key: role_key,
            p_role_label: role_label,
            p_permission_keys: [],
            p_actor_user_id: audit.actorUserId,
            p_origin: audit.origin,
            p_correlation_id: audit.correlationId,
        })
        .select("role_key, role_label, is_system, is_active, created_at")
        .single();

    if (error) {
        const status = error.code === "23505" ? 409 : 400;
        return NextResponse.json({ error: error.message }, { status });
    }

    /*
     * A brand-new role has no members, so no resolved bundle is stale — and an exemption argued
     * exactly that way is how the access-scope gap stayed invisible until D2's lock found it. The
     * cost is one eviction on an administrator action taken a few times a day; the alternative is an
     * exception list on a safety check, which this codebase has repeatedly recorded as a list of the
     * failures it has agreed not to see.
     */
    invalidateAdminShellContextCache();

    return NextResponse.json(created);
}

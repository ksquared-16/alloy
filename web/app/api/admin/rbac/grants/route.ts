import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requirePortalOrUsersRolesManageAuth, requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";

/** GET: list permission_keys granted for org + role_key. Portal (admin/ops) or Users & Roles managers. */
export async function GET(request: NextRequest) {
    const auth = await requirePortalOrUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { orgId } = auth.access;

    const { searchParams } = new URL(request.url);
    const role_key = searchParams.get("role_key")?.trim();
    if (!role_key) {
        return NextResponse.json({ error: "role_key is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: rows, error } = await supabase
        .from("role_permission_grants")
        .select("permission_key")
        .eq("org_id", orgId)
        .eq("role_key", role_key)
        .eq("allowed", true);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const permission_keys = (rows ?? []).map((r) => (r as { permission_key: string }).permission_key);

    return NextResponse.json({ permission_keys });
}

/** PUT: replace all grants for org + role_key. Requires org admin or `settings.users_roles` permission. */
export async function PUT(request: NextRequest) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { orgId } = auth.access;

    const { searchParams } = new URL(request.url);
    const role_key = searchParams.get("role_key")?.trim();
    if (!role_key) {
        return NextResponse.json({ error: "role_key is required" }, { status: 400 });
    }

    let body: { permission_keys?: string[] } = {};
    try {
        body = (await request.json()) as { permission_keys?: string[] };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const permission_keys = Array.isArray(body.permission_keys)
        ? body.permission_keys.filter((k) => typeof k === "string" && k.trim()).map((k) => (k as string).trim())
        : [];

    const supabase = createAdminClient();

    // W-61 / `H3`: this handler validated one column of the composite key and not the other.
    // `role_key` is FK-constrained, so an undefined role never produced a phantom grant — it
    // produced a constraint error the operator could not read. The check belongs here so the
    // rejection is stated, and it is made against the persisted row rather than against the
    // retired default-role constant, which was the fifth role vocabulary.
    const { data: roleRow, error: roleErr } = await supabase
        .from("role_definitions")
        .select("role_key")
        .eq("org_id", orgId)
        .eq("role_key", role_key)
        .eq("is_active", true)
        .maybeSingle();
    if (roleErr) {
        return NextResponse.json(
            { error: "Could not verify the role; the grants were not changed." },
            { status: 500 },
        );
    }
    if (!roleRow) {
        return NextResponse.json({ error: `Invalid or inactive role_key: ${role_key}` }, { status: 400 });
    }

    const { data: activePerms } = await supabase
        .from("permission_definitions")
        .select("key")
        .eq("is_active", true);
    const validKeys = new Set((activePerms ?? []).map((p) => (p as { key: string }).key));
    const invalid = permission_keys.filter((k) => !validKeys.has(k));
    if (invalid.length > 0) {
        return NextResponse.json({ error: `Invalid or inactive permission keys: ${invalid.join(", ")}` }, { status: 400 });
    }

    // W-28 / `T-23`: this was "delete every grant for the role, then insert the new set" as two
    // untransacted statements, so a failed insert left the role holding ZERO grants — the same
    // defect class as `T-13` on a second authority table. PostgREST cannot span a transaction,
    // so the replacement is written as a delta instead: only the grants actually being removed
    // are deleted, and the removals run BEFORE the additions.
    //
    // That ordering is deliberate and is the security-bearing half. If the second statement
    // fails, the role holds a SUBSET of both its prior and its intended authority — never a
    // superset, and never nothing. Failing the other way round would leave the role holding
    // grants the operator had just chosen to revoke, which is a failed revocation reported as
    // an error rather than as a wipe. Retrying converges, because both statements are idempotent.
    //
    // This bounds the blast radius; it is not atomicity. The exit criterion is NOT claimed here:
    // closing it needs the replacement to become one RPC, which needs a migration channel (OD-1).
    const { data: currentRows, error: currentErr } = await supabase
        .from("role_permission_grants")
        .select("permission_key")
        .eq("org_id", orgId)
        .eq("role_key", role_key);

    if (currentErr) {
        return NextResponse.json({ error: currentErr.message }, { status: 500 });
    }

    // An unreadable current set must not be treated as an empty one: `toRemove` would then be
    // empty and the revocation half of the operator's edit would silently not happen. That is
    // W-43's read-failure lesson, applied to a delta instead of to a resolver.
    const desired = new Set(permission_keys);
    const current = (currentRows ?? []).map((r) => (r as { permission_key: string }).permission_key);
    const toRemove = current.filter((k) => !desired.has(k));

    if (toRemove.length > 0) {
        const { error: deleteErr } = await supabase
            .from("role_permission_grants")
            .delete()
            .eq("org_id", orgId)
            .eq("role_key", role_key)
            .in("permission_key", toRemove);

        if (deleteErr) {
            return NextResponse.json({ error: deleteErr.message }, { status: 500 });
        }
    }

    if (permission_keys.length > 0) {
        // Upsert rather than insert: a grant row that exists with `allowed = false` is not in
        // `toRemove` (its key is still desired) and would collide on a bare insert.
        const rows = permission_keys.map((permission_key) => ({
            org_id: orgId,
            role_key,
            permission_key,
            allowed: true,
        }));
        const { error: upsertErr } = await supabase
            .from("role_permission_grants")
            .upsert(rows, { onConflict: "org_id,role_key,permission_key" });
        if (upsertErr) {
            return NextResponse.json({ error: upsertErr.message }, { status: 500 });
        }
    }

    return NextResponse.json({ ok: true });
}

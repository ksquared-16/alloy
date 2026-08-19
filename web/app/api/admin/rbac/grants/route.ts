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

    // Key validation is NOT performed here any more. It moved inside the transaction that writes,
    // because a key deactivated between a check here and a write below was validated as live and
    // written anyway. The RPC re-raises the same rejection, and it is mapped back to the same 400
    // below, so the operator-visible contract is unchanged.

    // W-28 / `S-12` / `T-23` — ONE database operation owns the transition.
    //
    // The history matters, because two earlier shapes were each better than the last and neither
    // was atomic. It began as "delete every grant for the role, then insert the new set" as two
    // untransacted statements, so a failed insert left the role holding ZERO grants. That became a
    // fail-closed delta — read the current set, delete only the removals, upsert the additions,
    // removals first — which bounded the blast radius to under-granting. But a delta computed in
    // application code from a prior READ has a race no ordering can fix: two operators editing the
    // same role each compute their removals against their own snapshot, the writes interleave, and
    // the committed state matches NEITHER operator's intent.
    //
    // `replace_role_permission_grants` closes it. The function takes a row lock on the role before
    // it reads anything, so concurrent replacements of the same role SERIALIZE — proven, not
    // assumed: a second caller blocks until the first commits. Key validation moved inside that
    // same transaction, so a key deactivated mid-flight can no longer be validated as live and
    // written anyway. Delete and insert cannot half-happen.
    //
    // Authorization did not move. `requireUsersRolesManageAuth` above still decides WHO may ask;
    // the function decides only WHAT the set becomes, and is `EXECUTE`-able by `service_role` alone.
    const { data: granted, error: replaceErr } = await supabase.rpc("replace_role_permission_grants", {
        p_org_id: orgId,
        p_role_key: role_key,
        p_permission_keys: permission_keys,
    });

    if (replaceErr) {
        // The function's rejections are re-raised as the same operator-visible 400s the route used
        // to produce itself, so moving the check into the transaction changed nothing the operator
        // sees. Anything else is a genuine failure and must not read as a partial success.
        const message = replaceErr.message ?? "";
        const invalid = message.match(/invalid_permission_keys:([^\s"]+)/);
        if (invalid) {
            return NextResponse.json(
                { error: `Invalid or inactive permission keys: ${invalid[1].split(",").join(", ")}` },
                { status: 400 },
            );
        }
        if (/unknown_role_key:/.test(message)) {
            return NextResponse.json({ error: `Invalid or inactive role_key: ${role_key}` }, { status: 400 });
        }
        return NextResponse.json(
            { error: "The grants were not changed." },
            { status: 500 },
        );
    }

    // The function returns the resulting set. Echoing it means the operator's next render is the
    // state the database committed, not the state the client hoped for.
    const resulting = Array.isArray(granted)
        ? (granted as { granted_permission_key: string }[]).map((r) => r.granted_permission_key)
        : [];

    return NextResponse.json({ ok: true, permission_keys: resulting });
}

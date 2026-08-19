import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireUsersRolesManageAuth } from "@/lib/admin/canManageUsersAndRoles";

/** PATCH: update role (role_label, is_active). Requires org admin or `settings.users_roles` permission. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ role_key: string }> }
) {
    const auth = await requireUsersRolesManageAuth();
    if (!auth.ok) return auth.response;
    const { orgId } = auth.access;

    const { role_key } = await context.params;
    if (!role_key) {
        return NextResponse.json({ error: "Missing role_key" }, { status: 400 });
    }

    let body: { role_label?: string; is_active?: boolean; permission_keys?: string[] } = {};
    try {
        body = (await request.json()) as { role_label?: string; is_active?: boolean; permission_keys?: string[] };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existing, error: fetchErr } = await supabase
        .from("role_definitions")
        .select("role_key, is_system")
        .eq("org_id", orgId)
        .eq("role_key", role_key)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const is_system = (existing as { is_system: boolean }).is_system;

    // W-58: the system-role guard must cover the combined path too. Placing the combined branch
    // BEFORE this check would have let a submit that carries `permission_keys` deactivate a system
    // role that the meta-only path refuses — a hole opened by the convenience of one request.
    if (is_system && body.is_active === false) {
        return NextResponse.json({ error: "System roles cannot be deactivated" }, { status: 400 });
    }

    // W-58 / `RM-11` — ONE submit, one transaction.
    //
    // `01…§40`: the role page had three independent save paths and no dirty-state tracking, so an
    // operator who edited the label AND the grid and pressed one button silently discarded the other
    // edit. Sending `permission_keys` alongside the meta fields makes this the single
    // authority-mutating request for a submit.
    //
    // `01…§52` is why this could not be built when it was first listed: composing a PATCH with the
    // old untransacted delete-then-insert would have given one operator action THREE failure points
    // and no compensation — "a partial failure would leave the label changed and the grants empty."
    // `W-28` supplied the atomicity, and this composes on it: meta is written first and the grants
    // replacement second, in ONE transaction, so a failure in the grants half rolls the label back.
    if (Array.isArray(body.permission_keys)) {
        const permission_keys = body.permission_keys
            .filter((k) => typeof k === "string" && k.trim())
            .map((k) => (k as string).trim());

        const { data: granted, error: saveErr } = await supabase.rpc("save_role_definition_and_grants", {
            p_org_id: orgId,
            p_role_key: role_key,
            // NULL means "not edited", so a submit that changes only the grid does not rewrite the
            // label with whatever the page happened to be holding.
            p_role_label: typeof body.role_label === "string" ? body.role_label.trim() : null,
            p_is_active: typeof body.is_active === "boolean" ? body.is_active : null,
            p_permission_keys: permission_keys,
        });

        if (saveErr) {
            const message = saveErr.message ?? "";
            const invalid = message.match(/invalid_permission_keys:([^\s"]+)/);
            if (invalid) {
                return NextResponse.json(
                    { error: `Invalid or inactive permission keys: ${invalid[1].split(",").join(", ")}` },
                    { status: 400 },
                );
            }
            if (/unknown_role_key:/.test(message)) {
                return NextResponse.json({ error: "Role not found" }, { status: 404 });
            }
            // Nothing persisted — the whole submit rolled back. Saying so is the point: the operator
            // must not be left believing half of their edit landed.
            return NextResponse.json({ error: "Nothing was saved." }, { status: 500 });
        }

        const { data: role } = await supabase
            .from("role_definitions")
            .select("role_key, role_label, is_system, is_active, created_at")
            .eq("org_id", orgId)
            .eq("role_key", role_key)
            .single();

        return NextResponse.json({
            ...(role ?? {}),
            permission_keys: Array.isArray(granted)
                ? (granted as { granted_permission_key: string }[]).map((r) => r.granted_permission_key)
                : [],
        });
    }

    const updates: { role_label?: string; is_active?: boolean } = {};
    if (typeof body.role_label === "string") {
        updates.role_label = body.role_label.trim();
    }
    if (typeof body.is_active === "boolean") {
        if (is_system && body.is_active === false) {
            return NextResponse.json({ error: "System roles cannot be deactivated" }, { status: 400 });
        }
        updates.is_active = body.is_active;
    }

    if (Object.keys(updates).length === 0) {
        const { data: current } = await supabase
            .from("role_definitions")
            .select("role_key, role_label, is_system, is_active, created_at")
            .eq("org_id", orgId)
            .eq("role_key", role_key)
            .single();
        return NextResponse.json(current ?? {});
    }

    const { data: updated, error: updateErr } = await supabase
        .from("role_definitions")
        .update(updates)
        .eq("org_id", orgId)
        .eq("role_key", role_key)
        .select("role_key, role_label, is_system, is_active, created_at")
        .single();

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json(updated);
}

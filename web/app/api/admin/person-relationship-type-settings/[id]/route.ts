import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";

const ALLOWED_PATCH_KEYS = ["label", "description", "sort_order", "is_active"] as const;

/** PATCH: update person_relationship_type_setting. Admin only. System types: key not editable. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("person_relationship_type_settings")
        .select("id, org_id, is_system")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Relationship type not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_PATCH_KEYS) {
        if (body[key] === undefined) continue;
        if (key === "label") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() || null : null;
            continue;
        }
        if (key === "description") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() || null : null;
            continue;
        }
        if (key === "sort_order") {
            const v = body[key];
            updates[key] = typeof v === "number" && !Number.isNaN(v) ? v : Number(v);
            continue;
        }
        if (key === "is_active") {
            updates[key] = !!body[key];
            continue;
        }
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
        .from("person_relationship_type_settings")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }
    if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logAdminAudit({
        entity: "person_relationship_type_settings",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(updated);
}

/** DELETE: not implemented. Use is_active=false to deactivate. Records may reference key in person_relationships.relationship_type. */
export async function DELETE() {
    return NextResponse.json(
        { error: "Delete not supported. Set is_active to false to deactivate." },
        { status: 405 }
    );
}

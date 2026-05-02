import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
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

    const updates: Record<string, unknown> = {};
    if (typeof body.label === "string") updates.label = body.label.trim() || null;
    if (typeof body.description === "string") updates.description = body.description.trim() || null;
    if (typeof body.sort_order === "number" && !Number.isNaN(body.sort_order)) updates.sort_order = body.sort_order;

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: updated, error } = await supabase
        .from("field_section_definitions")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();

    if (error || !updated) {
        return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 400 });
    }

    logAdminAudit({
        entity: "field_section_definitions",
        id,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
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

    const supabase = createAdminClient();
    const { data: row, error: loadErr } = await supabase
        .from("field_section_definitions")
        .select("entity_type, section_key")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (loadErr || !row) {
        return NextResponse.json({ error: loadErr?.message ?? "Not found" }, { status: 404 });
    }

    const entity_type = String(row.entity_type);
    const section_key = String(row.section_key);

    const { count, error: countErr } = await supabase
        .from("field_definitions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entity_type)
        .eq("section_key", section_key);

    if (countErr) {
        return NextResponse.json({ error: countErr.message }, { status: 500 });
    }
    const n = count ?? 0;
    if (n > 0) {
        return NextResponse.json(
            {
                error: `Cannot delete: ${n} field definition(s) still use section_key "${section_key}" for ${entity_type}.`,
                field_definition_count: n,
            },
            { status: 409 }
        );
    }

    const { error } = await supabase.from("field_section_definitions").delete().eq("id", id).eq("org_id", ctx.orgId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logAdminAudit({
        entity: "field_section_definitions",
        id,
        changed_fields: ["deleted"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ ok: true });
}

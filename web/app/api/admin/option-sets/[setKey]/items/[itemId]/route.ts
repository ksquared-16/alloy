import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";

function decodeSetKeyParam(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** PATCH: update option_set_item label, sort_order, metadata. item_key is immutable. Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ setKey: string; itemId: string }> }
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

    const { setKey: rawKey, itemId } = await context.params;
    const set_key = decodeSetKeyParam(rawKey ?? "").trim();
    if (!set_key || !itemId) {
        return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: setRow, error: setErr } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("set_key", set_key)
        .maybeSingle();

    if (setErr || !setRow) {
        return NextResponse.json({ error: "Option set not found" }, { status: 404 });
    }

    const option_set_id = String(setRow.id);

    const { data: existing, error: exErr } = await supabase
        .from("option_set_items")
        .select("id, option_set_id")
        .eq("id", itemId)
        .maybeSingle();

    if (exErr || !existing || String(existing.option_set_id) !== option_set_id) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (body.label !== undefined) {
        const label = typeof body.label === "string" ? body.label.trim() : "";
        if (!label) {
            return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
        }
        updates.label = label;
    }
    if (body.sort_order !== undefined) {
        const v = body.sort_order;
        updates.sort_order = typeof v === "number" && !Number.isNaN(v) ? v : Number(v);
    }
    if (body.metadata !== undefined) {
        updates.metadata =
            body.metadata != null && typeof body.metadata === "object" && !Array.isArray(body.metadata)
                ? body.metadata
                : {};
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No fields to update (label, sort_order, metadata)" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
        .from("option_set_items")
        .update(updates)
        .eq("id", itemId)
        .eq("option_set_id", option_set_id)
        .select()
        .single();

    if (updateErr || !updated) {
        return NextResponse.json({ error: updateErr?.message ?? "Update failed" }, { status: 400 });
    }

    logAdminAudit({
        entity: "option_set_items",
        id: itemId,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(updated);
}

/** DELETE: remove option_set_item. Admin only. */
export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ setKey: string; itemId: string }> }
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

    const { setKey: rawKey, itemId } = await context.params;
    const set_key = decodeSetKeyParam(rawKey ?? "").trim();
    if (!set_key || !itemId) {
        return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: setRow, error: setErr } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("set_key", set_key)
        .maybeSingle();

    if (setErr || !setRow) {
        return NextResponse.json({ error: "Option set not found" }, { status: 404 });
    }

    const option_set_id = String(setRow.id);

    const { error: delErr } = await supabase
        .from("option_set_items")
        .delete()
        .eq("id", itemId)
        .eq("option_set_id", option_set_id);

    if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    logAdminAudit({
        entity: "option_set_items",
        id: itemId,
        changed_fields: ["deleted"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ ok: true });
}

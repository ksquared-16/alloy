import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { collectOptionSetUsage } from "@/lib/admin/collectOptionSetUsage";
import { logAdminAudit } from "@/lib/adminAuth";

function decodeSetKeyParam(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** GET: single option set + items for current org. Admin/ops. */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ setKey: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { setKey: rawKey } = await context.params;
    const set_key = decodeSetKeyParam(rawKey ?? "").trim();
    if (!set_key) {
        return NextResponse.json({ error: "Invalid set_key" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: setRow, error: setErr } = await supabase
        .from("option_sets")
        .select("id, org_id, set_key, label, sort_order, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .eq("set_key", set_key)
        .maybeSingle();

    if (setErr) {
        return NextResponse.json({ error: setErr.message }, { status: 500 });
    }
    if (!setRow) {
        return NextResponse.json({ error: "Option set not found" }, { status: 404 });
    }

    const setId = String(setRow.id);
    const { data: items, error: itemsErr } = await supabase
        .from("option_set_items")
        .select("id, option_set_id, item_key, label, sort_order, metadata, created_at, updated_at")
        .eq("option_set_id", setId)
        .order("sort_order", { ascending: true })
        .order("item_key", { ascending: true });

    if (itemsErr) {
        return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    const blockers = await collectOptionSetUsage(supabase, ctx.orgId, set_key);

    return NextResponse.json({
        set: setRow,
        items: items ?? [],
        usage_blockers: blockers,
    });
}

/** PATCH: update option set label / sort_order only. Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ setKey: string }> }
) {
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

    const { setKey: rawKey } = await context.params;
    const set_key = decodeSetKeyParam(rawKey ?? "").trim();
    if (!set_key) {
        return NextResponse.json({ error: "Invalid set_key" }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No allowed fields to update (label, sort_order)" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: updated, error: updateErr } = await supabase
        .from("option_sets")
        .update(updates)
        .eq("org_id", ctx.orgId)
        .eq("set_key", set_key)
        .select()
        .single();

    if (updateErr || !updated) {
        return NextResponse.json({ error: updateErr?.message ?? "Not found" }, { status: 400 });
    }

    logAdminAudit({
        entity: "option_sets",
        id: String(updated.id),
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(updated);
}

/** DELETE: remove option set (cascades items) if unused. Admin only. */
export async function DELETE(
    _request: NextRequest,
    context: { params: Promise<{ setKey: string }> }
) {
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

    const { setKey: rawKey } = await context.params;
    const set_key = decodeSetKeyParam(rawKey ?? "").trim();
    if (!set_key) {
        return NextResponse.json({ error: "Invalid set_key" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const blockers = await collectOptionSetUsage(supabase, ctx.orgId, set_key);
    if (blockers.length > 0) {
        return NextResponse.json(
            {
                error: "Cannot delete: option set is referenced by field definitions or pricing dimensions",
                usage_blockers: blockers,
            },
            { status: 409 }
        );
    }

    const { data: existing, error: fetchErr } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("set_key", set_key)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Option set not found" }, { status: 404 });
    }

    const { error: delErr } = await supabase
        .from("option_sets")
        .delete()
        .eq("org_id", ctx.orgId)
        .eq("set_key", set_key);

    if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    logAdminAudit({
        entity: "option_sets",
        id: String(existing.id),
        changed_fields: ["deleted"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ ok: true });
}

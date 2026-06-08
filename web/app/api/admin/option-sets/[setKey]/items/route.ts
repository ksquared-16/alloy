import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";

const ITEM_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function decodeSetKeyParam(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** POST: add item to option set. Admin only. */
export async function POST(
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

    let item_key =
        typeof body.item_key === "string"
            ? body.item_key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
            : "";
    if (!ITEM_KEY_REGEX.test(item_key)) {
        return NextResponse.json(
            { error: "item_key must be 2–64 characters: lowercase letters, numbers, underscores only" },
            { status: 400 }
        );
    }

    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
        return NextResponse.json({ error: "label is required" }, { status: 400 });
    }

    const sort_order =
        typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 0;

    const metadata =
        body.metadata != null && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {};

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

    const { data: created, error: insertErr } = await supabase
        .from("option_set_items")
        .insert({
            option_set_id,
            item_key,
            label,
            sort_order,
            metadata,
        })
        .select()
        .single();

    if (insertErr) {
        if (insertErr.message.includes("unique") || insertErr.code === "23505") {
            return NextResponse.json({ error: `item_key '${item_key}' already exists in this set` }, { status: 409 });
        }
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    logAdminAudit({
        entity: "option_set_items",
        id: String(created.id),
        changed_fields: ["created"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(created, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";

const SET_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

export type OptionSetListRow = {
    id: string;
    org_id: string;
    set_key: string;
    label: string;
    sort_order: number;
    created_at: string;
    updated_at: string | null;
    item_count: number;
};

/** GET: list option_sets for current org with item counts. Admin/ops. */
export async function GET() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    const { data: sets, error: setsErr } = await supabase
        .from("option_sets")
        .select("id, org_id, set_key, label, sort_order, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .order("sort_order", { ascending: true })
        .order("set_key", { ascending: true });

    if (setsErr) {
        return NextResponse.json({ error: setsErr.message }, { status: 500 });
    }

    const list = sets ?? [];
    const setIds = list.map((s) => s.id as string);
    const countBySetId = new Map<string, number>();
    if (setIds.length > 0) {
        const { data: items, error: itemsErr } = await supabase
            .from("option_set_items")
            .select("option_set_id")
            .in("option_set_id", setIds);
        if (itemsErr) {
            return NextResponse.json({ error: itemsErr.message }, { status: 500 });
        }
        for (const row of items ?? []) {
            const sid = String((row as { option_set_id: string }).option_set_id);
            countBySetId.set(sid, (countBySetId.get(sid) ?? 0) + 1);
        }
    }

    const option_sets: OptionSetListRow[] = list.map((s) => ({
        id: String(s.id),
        org_id: String(s.org_id),
        set_key: String(s.set_key),
        label: String(s.label),
        sort_order: typeof s.sort_order === "number" ? s.sort_order : 0,
        created_at: String(s.created_at),
        updated_at: s.updated_at != null ? String(s.updated_at) : null,
        item_count: countBySetId.get(String(s.id)) ?? 0,
    }));

    return NextResponse.json({ option_sets });
}

/** POST: create option_set. Admin only. */
export async function POST(request: NextRequest) {
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

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    let set_key =
        typeof body.set_key === "string"
            ? body.set_key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
            : "";
    if (!SET_KEY_REGEX.test(set_key)) {
        return NextResponse.json(
            { error: "set_key must be 2–64 characters: lowercase letters, numbers, underscores only" },
            { status: 400 }
        );
    }

    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
        return NextResponse.json({ error: "label is required" }, { status: 400 });
    }

    const sort_order =
        typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 0;

    const supabase = createAdminClient();
    const { data: dup } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("set_key", set_key)
        .maybeSingle();

    if (dup) {
        return NextResponse.json({ error: `An option set with set_key '${set_key}' already exists` }, { status: 409 });
    }

    const { data: created, error: insertErr } = await supabase
        .from("option_sets")
        .insert({
            org_id: ctx.orgId,
            set_key,
            label,
            sort_order,
        })
        .select()
        .single();

    if (insertErr || !created) {
        return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 400 });
    }

    logAdminAudit({
        entity: "option_sets",
        id: String(created.id),
        changed_fields: ["created"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(created, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

export type PersonRelationshipTypeSetting = {
    id: string;
    org_id: string;
    key: string;
    label: string | null;
    description: string | null;
    sort_order: number;
    is_system: boolean;
    is_active: boolean;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string | null;
};

/** GET: list person_relationship_type_settings for current org. Optional ?active_only=true. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active_only") === "true";

    const supabase = createAdminClient();
    let q = supabase
        .from("person_relationship_type_settings")
        .select("id, org_id, key, label, description, sort_order, is_system, is_active, metadata, created_at, updated_at")
        .eq("org_id", ctx.orgId);

    if (activeOnly) {
        q = q.eq("is_active", true);
    }

    const { data: rows, error } = await q.order("sort_order", { ascending: true }).order("label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items: PersonRelationshipTypeSetting[] = (rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        org_id: r.org_id as string,
        key: r.key as string,
        label: (r.label as string) ?? null,
        description: (r.description as string) ?? null,
        sort_order: Number(r.sort_order) ?? 100,
        is_system: Boolean(r.is_system),
        is_active: Boolean(r.is_active),
        metadata: (r.metadata as Record<string, unknown>) ?? null,
        created_at: r.created_at as string,
        updated_at: (r.updated_at as string) ?? null,
    }));

    return NextResponse.json({ items });
}

/** POST: create person_relationship_type_setting. Admin only. */
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

    let body: { key?: string; label?: string; description?: string; sort_order?: number; is_active?: boolean } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const keyRaw = typeof body.key === "string" ? body.key.trim() : "";
    const key = keyRaw.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "";
    const label = typeof body.label === "string" ? body.label.trim() || null : null;
    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 100;
    const is_active = body.is_active !== false;

    if (!key) {
        return NextResponse.json({ error: "key is required" }, { status: 400 });
    }
    if (!KEY_REGEX.test(key)) {
        return NextResponse.json({
            error: "key must be 2–64 characters, lowercase letters, numbers, and underscores only",
        }, { status: 400 });
    }
    if (!label) {
        return NextResponse.json({ error: "label is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const insert = {
        org_id: ctx.orgId,
        key,
        label,
        description,
        sort_order,
        is_system: false,
        is_active,
        metadata: {},
    };

    const { data: created, error } = await supabase
        .from("person_relationship_type_settings")
        .insert(insert)
        .select()
        .single();

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") {
            return NextResponse.json(
                { error: "A relationship type with this key already exists for this org" },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(created);
}

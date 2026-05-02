import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: list roles for org. Admin + ops can read. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("role_definitions")
        .select("role_key, role_label, is_system, is_active, created_at")
        .eq("org_id", ctx.orgId)
        .order("is_system", { ascending: false })
        .order("role_label", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const roles = (rows ?? []).map((r) => ({
        role_key: (r as { role_key: string }).role_key,
        role_label: (r as { role_label: string }).role_label,
        is_system: (r as { is_system: boolean }).is_system,
        is_active: (r as { is_active: boolean }).is_active,
        created_at: (r as { created_at?: string }).created_at ?? null,
    }));

    return NextResponse.json({ roles });
}

/** POST: create role. Admin only. */
export async function POST(request: NextRequest) {
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

    let body: { role_key?: string; role_label?: string } = {};
    try {
        body = (await request.json()) as { role_key?: string; role_label?: string };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rawKey = typeof body.role_key === "string" ? body.role_key.trim() : "";
    const role_key = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || null;
    const role_label = typeof body.role_label === "string" ? body.role_label.trim() || null : null;

    if (!role_key) {
        return NextResponse.json({ error: "role_key is required and must be a valid slug" }, { status: 400 });
    }
    if (!role_label) {
        return NextResponse.json({ error: "role_label is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: existing } = await supabase
        .from("role_definitions")
        .select("role_key")
        .eq("org_id", ctx.orgId)
        .eq("role_key", role_key)
        .maybeSingle();

    if (existing) {
        return NextResponse.json({ error: "Role key already exists in this org" }, { status: 409 });
    }

    const { data: created, error } = await supabase
        .from("role_definitions")
        .insert({
            org_id: ctx.orgId,
            role_key,
            role_label,
            is_system: false,
            is_active: true,
        })
        .select("role_key, role_label, is_system, is_active, created_at")
        .single();

    if (error) {
        const status = error.code === "23505" ? 409 : 400;
        return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(created);
}

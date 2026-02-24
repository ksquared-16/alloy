import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list permission_keys granted for org + role_key. Admin + ops can read. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const role_key = searchParams.get("role_key")?.trim();
    if (!role_key) {
        return NextResponse.json({ error: "role_key is required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: rows, error } = await supabase
        .from("role_permission_grants")
        .select("permission_key")
        .eq("org_id", ctx.orgId)
        .eq("role_key", role_key);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const permission_keys = (rows ?? []).map((r) => (r as { permission_key: string }).permission_key);

    return NextResponse.json({ permission_keys });
}

/** PUT: replace all grants for org + role_key. Admin only. */
export async function PUT(request: NextRequest) {
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

    const { data: activePerms } = await supabase
        .from("permissions")
        .select("key")
        .eq("is_active", true);
    const validKeys = new Set((activePerms ?? []).map((p) => (p as { key: string }).key));
    const invalid = permission_keys.filter((k) => !validKeys.has(k));
    if (invalid.length > 0) {
        return NextResponse.json({ error: `Invalid or inactive permission keys: ${invalid.join(", ")}` }, { status: 400 });
    }

    const { error: deleteErr } = await supabase
        .from("role_permission_grants")
        .delete()
        .eq("org_id", ctx.orgId)
        .eq("role_key", role_key);

    if (deleteErr) {
        return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    if (permission_keys.length > 0) {
        const inserts = permission_keys.map((permission_key) => ({
            org_id: ctx.orgId,
            role_key,
            permission_key,
        }));
        const { error: insertErr } = await supabase.from("role_permission_grants").insert(inserts);
        if (insertErr) {
            return NextResponse.json({ error: insertErr.message }, { status: 500 });
        }
    }

    return NextResponse.json({ permission_keys });
}

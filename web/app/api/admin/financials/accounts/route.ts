import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data, error } = await supabase
        .from("gl_accounts")
        .select("id, code, name, type, currency, is_active, created_at, updated_at")
        .eq("org_id", orgId)
        .order("code", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
}

/** POST: create GL account. Admin only. */
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
    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const code = typeof body.code === "string" ? (body.code as string).trim() : "";
    const name = typeof body.name === "string" ? (body.name as string).trim() : "";
    const type = typeof body.type === "string" ? (body.type as string).trim() || "expense" : "expense";
    const currency = typeof body.currency === "string" ? (body.currency as string).trim() || "USD" : "USD";
    const is_active = body.is_active !== false;

    if (!code) {
        return NextResponse.json({ error: "Code is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data: existing } = await supabase
        .from("gl_accounts")
        .select("id")
        .eq("org_id", orgId)
        .eq("code", code)
        .maybeSingle();

    if (existing) {
        return NextResponse.json({ error: "An account with this code already exists" }, { status: 400 });
    }

    const { data: inserted, error: insertErr } = await supabase
        .from("gl_accounts")
        .insert({
            org_id: orgId,
            code,
            name: name || code,
            type,
            currency,
            is_active,
        })
        .select("id, code, name, type, currency, is_active, created_at, updated_at")
        .single();

    if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    return NextResponse.json(inserted);
}

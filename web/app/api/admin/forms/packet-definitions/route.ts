import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";

const KEY_RE = /^[a-z][a-z0-9_]{1,62}$/;

/** GET /api/admin/forms/packet-definitions — list packet definitions for org. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("form_packet_definitions")
        .select("id, org_id, key, name, description, is_active, metadata, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .order("name", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return jsonData(data ?? []);
}

/** POST /api/admin/forms/packet-definitions — create packet definition (admin only). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const key = typeof body.key === "string" ? body.key.trim().toLowerCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!key || !name) return jsonError("key and name are required", 400);
    if (!KEY_RE.test(key)) {
        return jsonError("key must be lowercase letters, digits, underscore; start with a letter (2–63 chars)", 400);
    }

    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const is_active = typeof body.is_active === "boolean" ? body.is_active : true;
    const metadata =
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {};

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("form_packet_definitions")
        .insert({
            org_id: ctx.orgId,
            key,
            name,
            description,
            is_active,
            metadata: { ...metadata, created_via: "adminV2_packet_definitions" },
        })
        .select("id, org_id, key, name, description, is_active, metadata, created_at, updated_at")
        .single();

    if (error) {
        if (error.code === "23505") return jsonError("A packet with this key already exists", 409);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonData(data, { status: 201 });
}

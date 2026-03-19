import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

const ALLOWED_PATCH = [
    "field_label",
    "field_type",
    "is_required",
    "is_ai_extractable",
    "extraction_hint",
    "sort_order",
    "metadata",
] as const;

const FIELD_TYPES = ["text", "email", "phone", "number", "date", "datetime", "boolean"] as const;

/** PATCH: update document_field_definition. Admin only. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
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

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("document_field_definitions")
        .select("id, org_id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Definition not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_PATCH) {
        if (body[key] === undefined) continue;
        if (key === "field_label") {
            const v = typeof body[key] === "string" ? (body[key] as string).trim() : "";
            if (!v) return NextResponse.json({ error: "field_label cannot be empty" }, { status: 400 });
            updates[key] = v;
            continue;
        }
        if (key === "field_type") {
            const v = typeof body[key] === "string" ? (body[key] as string).trim() : "";
            if (!FIELD_TYPES.includes(v as (typeof FIELD_TYPES)[number])) {
                return NextResponse.json({ error: `field_type must be one of: ${FIELD_TYPES.join(", ")}` }, { status: 400 });
            }
            updates[key] = v;
            continue;
        }
        if (key === "extraction_hint") {
            updates[key] = typeof body[key] === "string" ? (body[key] as string).trim() || null : null;
            continue;
        }
        if (key === "sort_order") {
            const v = body[key];
            updates[key] = v === null ? null : typeof v === "number" && !Number.isNaN(v) ? v : Number(v);
            continue;
        }
        if (key === "metadata") {
            if (typeof body[key] !== "object" || body[key] === null) {
                return NextResponse.json({ error: "metadata must be an object" }, { status: 400 });
            }
            updates[key] = body[key];
            continue;
        }
        updates[key] = Boolean(body[key]);
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from("document_field_definitions").update(updates).eq("id", id).select("*").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ definition: data });
}

/** DELETE document_field_definition. Admin only. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase.from("document_field_definitions").delete().eq("id", id).eq("org_id", ctx.orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}

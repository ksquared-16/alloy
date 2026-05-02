import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";

const ALLOWED_ENTITY_TYPES = ["person", "customer", "job", "opportunity", "vendor", "schedule", "location"] as const;
const SECTION_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type")?.trim() || null;
    if (!entityType || !ALLOWED_ENTITY_TYPES.includes(entityType as (typeof ALLOWED_ENTITY_TYPES)[number])) {
        return NextResponse.json(
            { error: `entity_type required; one of: ${ALLOWED_ENTITY_TYPES.join(", ")}` },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("field_section_definitions")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entityType)
        .order("sort_order", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ sections: data ?? [] });
}

/** POST: create section metadata row (label for section_key). */
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

    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim() : "";
    if (!ALLOWED_ENTITY_TYPES.includes(entity_type as (typeof ALLOWED_ENTITY_TYPES)[number])) {
        return NextResponse.json({ error: `entity_type invalid` }, { status: 400 });
    }

    const section_key =
        typeof body.section_key === "string" ? body.section_key.trim().toLowerCase().replace(/\s+/g, "_") : "";
    if (!SECTION_KEY_REGEX.test(section_key)) {
        return NextResponse.json(
            { error: "section_key must be 2–64 chars, lowercase letters, numbers, underscores" },
            { status: 400 }
        );
    }

    const label = typeof body.label === "string" ? body.label.trim() || section_key : section_key;
    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 100;

    const supabase = createAdminClient();
    const { data: created, error } = await supabase
        .from("field_section_definitions")
        .insert({
            org_id: ctx.orgId,
            entity_type,
            section_key,
            label,
            description,
            sort_order,
        })
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json({ error: "Section key already exists for this entity type" }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logAdminAudit({
        entity: "field_section_definitions",
        id: (created as { id: string }).id,
        changed_fields: ["created"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(created, { status: 201 });
}

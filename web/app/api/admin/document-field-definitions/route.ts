import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

const FIELD_TYPES = ["text", "email", "phone", "number", "date", "datetime", "boolean"] as const;
const FIELD_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

/** GET: list document_field_definitions for org + doc_type (required). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const docType = request.nextUrl.searchParams.get("doc_type")?.trim();
    if (!docType) {
        return NextResponse.json({ error: "doc_type query parameter is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("document_field_definitions")
        .select("*")
        .eq("org_id", ctx.orgId)
        .eq("doc_type", docType)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("field_label", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ definitions: data ?? [] });
}

/** POST: create definition. Admin only. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
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

    const doc_type = typeof body.doc_type === "string" ? body.doc_type.trim() : "";
    const field_key = typeof body.field_key === "string" ? body.field_key.trim() : "";
    const field_label = typeof body.field_label === "string" ? body.field_label.trim() : "";
    const field_type = typeof body.field_type === "string" ? body.field_type.trim() : "";

    if (!doc_type || doc_type.length > 128) {
        return NextResponse.json({ error: "doc_type is required (max 128 chars)" }, { status: 400 });
    }
    if (!FIELD_KEY_REGEX.test(field_key)) {
        return NextResponse.json(
            { error: "field_key must be 2–64 chars: lowercase letters, digits, underscore" },
            { status: 400 }
        );
    }
    if (!field_label) {
        return NextResponse.json({ error: "field_label is required" }, { status: 400 });
    }
    if (!FIELD_TYPES.includes(field_type as (typeof FIELD_TYPES)[number])) {
        return NextResponse.json({ error: `field_type must be one of: ${FIELD_TYPES.join(", ")}` }, { status: 400 });
    }

    const is_required = Boolean(body.is_required);
    const is_ai_extractable = Boolean(body.is_ai_extractable);
    const extraction_hint = typeof body.extraction_hint === "string" ? body.extraction_hint.trim() || null : null;
    const sort_order =
        body.sort_order === undefined || body.sort_order === null
            ? null
            : typeof body.sort_order === "number" && !Number.isNaN(body.sort_order)
              ? body.sort_order
              : Number(body.sort_order);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("document_field_definitions")
        .insert({
            org_id: ctx.orgId,
            doc_type,
            field_key,
            field_label,
            field_type,
            is_required,
            is_ai_extractable,
            extraction_hint,
            sort_order: sort_order != null && !Number.isNaN(sort_order) ? sort_order : null,
            metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {},
        })
        .select("*")
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json({ error: "A field with this key already exists for this doc type" }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ definition: data });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    dbInsertFormDefinition,
    dbListFormDefinitions,
    dbListFormIdsWithPublishedVersion,
} from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";

/** GET /api/admin/forms — list form definitions for org. */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    const { data, error } = await dbListFormDefinitions(supabase, ctx.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const forms = data ?? [];
    if (forms.length === 0) {
        return jsonData([]);
    }

    const { data: pubRows, error: pubErr } = await dbListFormIdsWithPublishedVersion(supabase, ctx.orgId);
    if (pubErr) return NextResponse.json({ error: pubErr.message }, { status: 500 });

    const publishedFormIds = new Set(
        (pubRows ?? []).map((r) => (r as { form_definition_id: string }).form_definition_id).filter(Boolean)
    );

    const enriched = forms.map((row) => ({
        ...(row as Record<string, unknown>),
        has_published_version: publishedFormIds.has((row as { id: string }).id),
    }));

    return jsonData(enriched);
}

/** POST /api/admin/forms — create form definition (admin only). */
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

    const key = typeof body.key === "string" ? body.key.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const kind = typeof body.kind === "string" ? body.kind.trim() : "";
    if (!key || !name) return jsonError("key and name are required", 400);
    if (kind !== "state" && kind !== "center") return jsonError("kind must be state or center", 400);

    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const is_active = typeof body.is_active === "boolean" ? body.is_active : true;
    const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};

    const supabase = createAdminClient();
    const { data, error } = await dbInsertFormDefinition(supabase, {
        org_id: ctx.orgId,
        key,
        name,
        kind,
        description,
        is_active,
        metadata,
    });

    if (error) {
        if (error.code === "23505") {
            return jsonError("A form with this key already exists", 409);
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return jsonData(data, { status: 201 });
}

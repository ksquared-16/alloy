import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    dbInsertFormDefinition,
    dbListFormDefinitionKeys,
    dbListFormDefinitions,
    dbListFormIdsWithPublishedVersion,
} from "@/lib/admin/forms/formsAdminDb";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";

/** GET /api/admin/forms — list form definitions for org. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const includeArchived = request.nextUrl.searchParams.get("include_archived") === "true";

    const supabase = createAdminClient();
    const { data, error } = await dbListFormDefinitions(supabase, ctx.orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const forms = (data ?? []).filter((row) => includeArchived || (row as { is_active?: boolean }).is_active !== false);
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

    const explicitKey = typeof body.key === "string" ? body.key.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const kindRaw = typeof body.kind === "string" ? body.kind.trim() : "";
    const kind = kindRaw || "center";
    if (!name) return jsonError("name is required", 400);
    if (kind !== "state" && kind !== "center") return jsonError("kind must be state or center", 400);

    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const is_active = typeof body.is_active === "boolean" ? body.is_active : true;
    const admin_category =
        typeof body.admin_category === "string" ? body.admin_category.trim() : typeof body.category === "string"
          ? body.category.trim()
          : "";
    const metadataBase =
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {};
    const metadata = {
        ...metadataBase,
        ...(admin_category ? { admin_category } : {}),
    };

    const supabase = createAdminClient();

    let key = explicitKey;
    if (!key) {
        try {
            const taken = await dbListFormDefinitionKeys(supabase, ctx.orgId);
            const base = slugKeyFromDisplayName(name);
            key = allocateUniqueKey(base, taken);
        } catch (e) {
            return NextResponse.json({ error: e instanceof Error ? e.message : "Key allocation failed" }, { status: 500 });
        }
    }

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

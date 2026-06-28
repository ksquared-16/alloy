import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { resolveOptionsByIndustry, resolveOptionsByVertical } from "@/lib/admin/personTypeSettings";
import { apiOk, apiError } from "@/lib/api/apiResponse";

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
    industry_id: string | null;
    vertical_id: string | null;
    created_at: string;
    updated_at: string | null;
};

/**
 * Configurable person relationship type settings (list/create).
 *
 * Phase 2F contract (migrated): every response uses the standard envelope
 * (`apiOk` / `apiError`). Success: `{ ok, data: { items } }` (GET) and
 * `{ ok, data: { item } }` (POST). HTTP status codes are preserved.
 * @see docs/api/api-response-contract.md
 */

/** GET: list person_relationship_type_settings for current org. Industry-driven: when active_only=true, uses org.industry_id to resolve options. Optional ?industry_id= override, ?vertical_id= for secondary. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return apiError(
            ctx.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            ctx.status === 401 ? "Unauthorized" : "Forbidden",
            ctx.status,
            undefined,
            { request }
        );
    }

    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get("all") === "true" || searchParams.get("all") === "1";
    const industryIdParam = searchParams.get("industry_id")?.trim() || null;
    const verticalId = searchParams.get("vertical_id")?.trim() || null;

    const supabase = createAdminClient();
    const selectCols = "id, org_id, key, label, description, sort_order, is_system, is_active, metadata, industry_id, vertical_id, created_at, updated_at";
    let q = supabase
        .from("person_relationship_type_settings")
        .select(selectCols)
        .eq("org_id", ctx.orgId);

    let orgIndustryId: string | null = null;
    if (!showAll) {
        const { data: orgRow } = await supabase.from("orgs").select("industry_id").eq("id", ctx.orgId).maybeSingle();
        orgIndustryId = (orgRow as { industry_id?: string } | null)?.industry_id ?? null;
    }
    const industryId = industryIdParam ?? orgIndustryId;

    if (showAll) {
        // no industry/active filter; return all configured rows
    } else if (verticalId) {
        q = q.eq("is_active", true).or(`vertical_id.eq.${verticalId},vertical_id.is.null`);
    } else if (industryId) {
        q = q.eq("is_active", true).or(`industry_id.eq.${industryId},industry_id.is.null`);
    } else {
        q = q.eq("is_active", true);
    }

    const { data: rows, error } = await q.order("sort_order", { ascending: true }).order("label", { ascending: true });

    if (error) {
        return apiError("INTERNAL", error.message, 500, undefined, { request });
    }

    let items: PersonRelationshipTypeSetting[] = (rows ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        org_id: r.org_id as string,
        key: r.key as string,
        label: (r.label as string) ?? null,
        description: (r.description as string) ?? null,
        sort_order: Number(r.sort_order) ?? 100,
        is_system: Boolean(r.is_system),
        is_active: Boolean(r.is_active),
        metadata: (r.metadata as Record<string, unknown>) ?? null,
        industry_id: (r.industry_id as string) ?? null,
        vertical_id: (r.vertical_id as string) ?? null,
        created_at: r.created_at as string,
        updated_at: (r.updated_at as string) ?? null,
    }));

    if (!showAll && industryId) {
        items = resolveOptionsByIndustry(items, industryId);
    } else if (!showAll && verticalId) {
        items = resolveOptionsByVertical(items, verticalId);
    }

    return apiOk({ items }, { request });
}

/** POST: create person_relationship_type_setting. Admin only. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return apiError(
            ctx.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            ctx.status === 401 ? "Unauthorized" : "Forbidden",
            ctx.status,
            undefined,
            { request }
        );
    }
    if (ctx.role !== "admin") {
        return apiError("FORBIDDEN", "Forbidden", 403, undefined, { request });
    }

    let body: { key?: string; label?: string; description?: string; sort_order?: number; is_active?: boolean } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return apiError("BAD_REQUEST", "Invalid JSON", 400, undefined, { request });
    }

    const keyRaw = typeof body.key === "string" ? body.key.trim() : "";
    const key = keyRaw.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "";
    const label = typeof body.label === "string" ? body.label.trim() || null : null;
    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 100;
    const is_active = body.is_active !== false;

    if (!key) {
        return apiError("BAD_REQUEST", "key is required", 400, undefined, { request });
    }
    if (!KEY_REGEX.test(key)) {
        return apiError(
            "BAD_REQUEST",
            "key must be 2–64 characters, lowercase letters, numbers, and underscores only",
            400,
            undefined,
            { request }
        );
    }
    if (!label) {
        return apiError("BAD_REQUEST", "label is required", 400, undefined, { request });
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
            return apiError(
                "CONFLICT",
                "A relationship type with this key already exists for this org",
                409,
                undefined,
                { request }
            );
        }
        return apiError("BAD_REQUEST", error.message, 400, undefined, { request });
    }

    return apiOk({ item: created }, { request });
}

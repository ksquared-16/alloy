import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    fetchEffectiveStatusDefinitionsDirect,
    fetchOrgStatusDefinitions,
} from "@/lib/admin/statusDefinitionsResolve";
import { ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES } from "@/lib/admin/statusDefinitionsAdminEntityTypes";
import { normalizeStatusDefinitionMetadata } from "@/lib/admin/normalizeStatusMetadata";
import { revalidateEffectiveStatusDefinitionsCache } from "@/lib/admin/statusDefinitionsCache";

const STATUS_KEY_REGEX = /^[a-z0-9_]{2,32}$/;

export type StatusDef = {
    id: string;
    org_id: string | null;
    entity_type: string;
    status_key: string;
    status_label: string | null;
    sort_order: number;
    is_active: boolean;
    is_system: boolean;
    metadata: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
};

/** GET: effective status_definitions for admin UI — org rows first, else industry defaults. */
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
    const includeInactive = searchParams.get("include_inactive") === "1";

    const supabase = createAdminClient();
    const activeOnly = !includeInactive;

    try {
        if (entityType) {
            const orgRows = await fetchOrgStatusDefinitions(supabase, ctx.orgId, entityType, { activeOnly });
            const source: "org" | "industry_defaults" = orgRows.length > 0 ? "org" : "industry_defaults";
            const rows =
                orgRows.length > 0
                    ? orgRows
                    : await fetchEffectiveStatusDefinitionsDirect(supabase, ctx.orgId, entityType, {
                          activeOnly: true,
                      });
            const statuses: StatusDef[] = rows.map((r) => ({
                id: r.id,
                org_id: r.org_id,
                entity_type: r.entity_type,
                status_key: r.status_key,
                status_label: r.status_label ?? null,
                sort_order: Number(r.sort_order) ?? 100,
                is_active: Boolean(r.is_active),
                is_system: Boolean(r.is_system),
                metadata: r.metadata ?? null,
                created_at: "",
                updated_at: "",
            }));
            return NextResponse.json({
                statuses,
                source,
                message:
                    source === "industry_defaults"
                        ? "No org-specific statuses yet; showing industry defaults. Add rows under this org to override."
                        : undefined,
            });
        }

        /**
         * Aggregate effective definitions for each entity type (same merge rules as
         * GET ?entity_type=…): org rows + industry defaults (`org_id` NULL) where applicable.
         * The previous org-only query hid global defaults when the org had no rows yet.
         */
        const rowsNested = await Promise.all(
            ADMIN_STATUS_DEFINITIONS_ENTITY_TYPES.map((entityType) =>
                fetchEffectiveStatusDefinitionsDirect(supabase, ctx.orgId, entityType, { activeOnly }),
            ),
        );
        const merged = rowsNested.flat();

        const statuses: StatusDef[] = merged.map((r) => ({
            id: r.id,
            org_id: r.org_id,
            entity_type: r.entity_type,
            status_key: r.status_key,
            status_label: r.status_label ?? null,
            sort_order: Number(r.sort_order) ?? 100,
            is_active: Boolean(r.is_active),
            is_system: Boolean(r.is_system),
            metadata: r.metadata ?? null,
            created_at: "",
            updated_at: "",
        }));

        return NextResponse.json({ statuses, source: "effective" as const });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

/** POST: create status_definition for current org. Admin only. */
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

    let body: {
        entity_type?: string;
        status_key?: string;
        status_label?: string;
        sort_order?: number;
        is_active?: boolean;
        metadata?: unknown;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const entity_type = typeof body.entity_type === "string" ? body.entity_type.trim() : "";
    const status_key_raw = typeof body.status_key === "string" ? body.status_key.trim() : "";
    const status_key = status_key_raw.toLowerCase();
    const status_label = typeof body.status_label === "string" ? (body.status_label as string).trim() || null : null;

    if (!entity_type) {
        return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
    }
    if (!status_key) {
        return NextResponse.json({ error: "status_key is required" }, { status: 400 });
    }
    if (!STATUS_KEY_REGEX.test(status_key)) {
        return NextResponse.json({
            error: "status_key must be 2–32 characters, lowercase letters, numbers, and underscores only",
        }, { status: 400 });
    }

    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 100;
    const is_active = body.is_active !== false;

    const supabase = createAdminClient();
    const insert = {
        org_id: ctx.orgId,
        entity_type,
        status_key,
        status_label,
        sort_order,
        is_active,
        is_system: false,
        metadata: normalizeStatusDefinitionMetadata(body.metadata),
        industry_key: null as string | null,
    };

    const { data: created, error } = await supabase
        .from("status_definitions")
        .insert(insert)
        .select()
        .single();

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") {
            return NextResponse.json(
                { error: "A status with this key already exists for this entity type" },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    revalidateEffectiveStatusDefinitionsCache(ctx.orgId);

    return NextResponse.json(created);
}

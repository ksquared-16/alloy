import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

type CategoryRow = {
    id: string;
    org_id: string;
    location_id: string;
    key: string;
    label: string;
    sort_order: number | null;
    is_active: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

function mapCategoryRow(r: Record<string, unknown>): CategoryRow {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        location_id: String(r.location_id ?? ""),
        key: String(r.key ?? "").trim(),
        label: String(r.label ?? "").trim(),
        sort_order: r.sort_order != null ? Number(r.sort_order) : null,
        is_active: r.is_active !== false,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null | undefined) ?? null,
    };
}

/** GET: list location program categories for current org. Optional ?location_id= filter. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const locationId = (searchParams.get("location_id") ?? "").trim();
    const includeInactive = searchParams.get("include_inactive") === "true";

    const supabase = createAdminClient();
    let q = supabase
        .from("location_program_categories")
        .select(
            "id, org_id, location_id, key, label, sort_order, is_active, metadata, created_at, updated_at"
        )
        .eq("org_id", ctx.orgId)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });

    if (locationId) {
        q = q.eq("location_id", locationId);
    }
    if (!includeInactive) {
        q = q.eq("is_active", true);
    }

    const { data, error } = await q;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        categories: (data ?? []).map((r) => mapCategoryRow(r as Record<string, unknown>)),
    });
}

/** PATCH: batch update categories (label, sort_order, is_active). */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    let body: { updates?: Array<Record<string, unknown>> } = {};
    try {
        body = (await request.json()) as { updates?: Array<Record<string, unknown>> };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const updates = Array.isArray(body.updates) ? body.updates : [];
    if (!updates.length) {
        return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const results: CategoryRow[] = [];

    for (const raw of updates) {
        const id = String(raw.id ?? "").trim();
        if (!id) continue;

        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof raw.label === "string") {
            const label = raw.label.trim();
            if (!label) {
                return NextResponse.json({ error: "Label cannot be empty" }, { status: 400 });
            }
            patch.label = label;
        }
        if (raw.sort_order !== undefined && raw.sort_order !== null) {
            patch.sort_order = Number(raw.sort_order);
        }
        if (typeof raw.is_active === "boolean") {
            patch.is_active = raw.is_active;
        }

        if (Object.keys(patch).length <= 1) continue;

        const { data, error } = await supabase
            .from("location_program_categories")
            .update(patch)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select(
                "id, org_id, location_id, key, label, sort_order, is_active, metadata, created_at, updated_at"
            )
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (data) {
            results.push(mapCategoryRow(data as Record<string, unknown>));
        }
    }

    return NextResponse.json({ categories: results, updated: results.length });
}

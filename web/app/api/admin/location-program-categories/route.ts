import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { slugifyLocationProgramCategoryKey } from "@/lib/locations/locationProgramCategories";

const PROGRAM_CATEGORY_KEY_RE = /^[a-z0-9_]{2,64}$/;

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

export function buildProgramCategoryPatch(
    raw: Record<string, unknown>,
    updatedAt = new Date().toISOString(),
): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
    const patch: Record<string, unknown> = { updated_at: updatedAt };
    if (typeof raw.label === "string") {
        const label = raw.label.trim();
        if (!label) return { ok: false, error: "Label cannot be empty" };
        patch.label = label;
    }
    if (raw.sort_order !== undefined && raw.sort_order !== null) {
        const sortOrder = Number(raw.sort_order);
        if (!Number.isFinite(sortOrder)) return { ok: false, error: "sort_order must be a number" };
        patch.sort_order = sortOrder;
    }
    if (typeof raw.is_active === "boolean") {
        patch.is_active = raw.is_active;
    }
    if (raw.metadata !== undefined) {
        if (raw.metadata == null || typeof raw.metadata !== "object" || Array.isArray(raw.metadata)) {
            return { ok: false, error: "metadata must be an object" };
        }
        patch.metadata = raw.metadata;
    }
    return { ok: true, patch };
}

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

/** PATCH: batch update categories, including the canonical program metadata fields. */
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

        const built = buildProgramCategoryPatch(raw);
        if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
        const { patch } = built;

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

/** POST: create a program category for one site location. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const locationId = String(body.location_id ?? "").trim();
    const label = String(body.label ?? "").trim();
    const rawKey = String(body.key ?? "").trim();
    const key = rawKey ? slugifyLocationProgramCategoryKey(rawKey) : slugifyLocationProgramCategoryKey(label);
    const sortOrder =
        body.sort_order != null && body.sort_order !== "" ? Number(body.sort_order) : null;
    const isActive = body.is_active !== false;

    if (!locationId) {
        return NextResponse.json({ error: "location_id is required" }, { status: 400 });
    }
    if (!label) {
        return NextResponse.json({ error: "label is required" }, { status: 400 });
    }
    if (!PROGRAM_CATEGORY_KEY_RE.test(key)) {
        return NextResponse.json({ error: "Invalid program category key" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: siteRow, error: siteErr } = await supabase
        .from("locations")
        .select("id, location_type")
        .eq("org_id", ctx.orgId)
        .eq("id", locationId)
        .maybeSingle();

    if (siteErr) {
        return NextResponse.json({ error: siteErr.message }, { status: 500 });
    }
    if (!siteRow) {
        return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }
    if (String((siteRow as { location_type?: string }).location_type ?? "").trim() !== "site") {
        return NextResponse.json(
            { error: "Program categories can only be added to site locations" },
            { status: 400 }
        );
    }

    let resolvedSortOrder = sortOrder;
    if (resolvedSortOrder == null || !Number.isFinite(resolvedSortOrder)) {
        const { data: existing } = await supabase
            .from("location_program_categories")
            .select("sort_order")
            .eq("org_id", ctx.orgId)
            .eq("location_id", locationId)
            .order("sort_order", { ascending: false })
            .limit(1);
        const top = existing?.[0] as { sort_order?: number | null } | undefined;
        const max = top?.sort_order != null ? Number(top.sort_order) : 0;
        resolvedSortOrder = max > 0 ? max + 10 : 10;
    }

    const { data, error } = await supabase
        .from("location_program_categories")
        .insert({
            org_id: ctx.orgId,
            location_id: locationId,
            key,
            label,
            sort_order: resolvedSortOrder,
            is_active: isActive,
            updated_at: new Date().toISOString(),
        })
        .select(
            "id, org_id, location_id, key, label, sort_order, is_active, metadata, created_at, updated_at"
        )
        .single();

    if (error) {
        const msg = error.message.includes("location_program_categories_org_location_key_unique")
            ? "A program with this key already exists for this site"
            : error.message;
        return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ category: mapCategoryRow(data as Record<string, unknown>) }, { status: 201 });
}

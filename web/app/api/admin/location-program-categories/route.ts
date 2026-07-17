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
    program_id: string | null;
    program_revision_id: string | null;
    configuration_consumption_id: string | null;
    local_description_override: string | null;
    local_authorization_evidence: string | null;
    created_at: string;
    updated_at: string | null;
};

const CATEGORY_SELECT =
    "id, org_id, location_id, key, label, sort_order, is_active, metadata, program_id, program_revision_id, configuration_consumption_id, local_description_override, local_authorization_evidence, created_at, updated_at";

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
    if (raw.local_description_override !== undefined) {
        if (raw.local_description_override !== null && typeof raw.local_description_override !== "string") {
            return { ok: false, error: "local_description_override must be text or null" };
        }
        patch.local_description_override =
            typeof raw.local_description_override === "string"
                ? raw.local_description_override.trim() || null
                : null;
    }
    if (raw.local_authorization_evidence !== undefined) {
        if (raw.local_authorization_evidence !== null && typeof raw.local_authorization_evidence !== "string") {
            return { ok: false, error: "local_authorization_evidence must be text or null" };
        }
        patch.local_authorization_evidence =
            typeof raw.local_authorization_evidence === "string"
                ? raw.local_authorization_evidence.trim() || null
                : null;
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
        program_id: (r.program_id as string | null | undefined) ?? null,
        program_revision_id: (r.program_revision_id as string | null | undefined) ?? null,
        configuration_consumption_id:
            (r.configuration_consumption_id as string | null | undefined) ?? null,
        local_description_override:
            (r.local_description_override as string | null | undefined) ?? null,
        local_authorization_evidence:
            (r.local_authorization_evidence as string | null | undefined) ?? null,
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
        .select(CATEGORY_SELECT)
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

        const { data: current, error: currentError } = await supabase
            .from("location_program_categories")
            .select("program_revision_id")
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (currentError) {
            return NextResponse.json({ error: currentError.message }, { status: 400 });
        }
        if (
            (current as { program_revision_id?: string | null } | null)?.program_revision_id
            && Object.prototype.hasOwnProperty.call(patch, "label")
        ) {
            return NextResponse.json(
                { error: "Published Program identity is managed by the Organization." },
                { status: 409 },
            );
        }

        const { data, error } = await supabase
            .from("location_program_categories")
            .update(patch)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select(CATEGORY_SELECT)
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
export async function POST() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    return NextResponse.json(
        {
            error:
                "Programs are created and published by the Organization. Apply a published Program to this Location.",
        },
        { status: 409 },
    );
}

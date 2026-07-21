import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    LOCATION_PROGRAM_CATEGORY_IDENTITY_SELECT_ATTEMPTS,
    LOCATION_PROGRAM_CATEGORY_SELECT_ATTEMPTS,
    isMissingColumnError,
    resolveProgramRevisionIdFromRow,
    stripUnavailableProgramCategoryPatchFields,
} from "@/lib/locations/locationProgramCategorySelect";

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

type AdminSupabase = ReturnType<typeof createAdminClient>;

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

export function mapCategoryRow(r: Record<string, unknown>): CategoryRow {
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
        program_revision_id: resolveProgramRevisionIdFromRow(r),
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

async function listProgramCategoryRows(
    supabase: AdminSupabase,
    orgId: string,
    options: { locationId?: string; includeInactive?: boolean },
): Promise<{ rows: CategoryRow[] } | { error: string }> {
    let lastError: string | null = null;
    for (const select of LOCATION_PROGRAM_CATEGORY_SELECT_ATTEMPTS) {
        let q = supabase
            .from("location_program_categories")
            .select(select)
            .eq("org_id", orgId)
            .order("sort_order", { ascending: true })
            .order("label", { ascending: true });
        if (options.locationId) q = q.eq("location_id", options.locationId);
        if (!options.includeInactive) q = q.eq("is_active", true);
        const { data, error } = await q;
        if (!error) {
            return {
                rows: (data ?? []).map((r) => mapCategoryRow(r as Record<string, unknown>)),
            };
        }
        lastError = error.message;
        if (!isMissingColumnError(error)) {
            return { error: error.message };
        }
    }
    return { error: lastError ?? "Failed to load location program categories" };
}

async function readProgramIdentityRevisionId(
    supabase: AdminSupabase,
    orgId: string,
    categoryId: string,
): Promise<{ revisionId: string | null } | { error: string }> {
    let lastError: string | null = null;
    for (const select of LOCATION_PROGRAM_CATEGORY_IDENTITY_SELECT_ATTEMPTS) {
        const { data, error } = await supabase
            .from("location_program_categories")
            .select(select)
            .eq("id", categoryId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (!error) {
            return { revisionId: resolveProgramRevisionIdFromRow((data as Record<string, unknown> | null) ?? null) };
        }
        lastError = error.message;
        if (!isMissingColumnError(error)) {
            return { error: error.message };
        }
    }
    return { error: lastError ?? "Failed to load program category identity" };
}

async function updateProgramCategoryRow(
    supabase: AdminSupabase,
    orgId: string,
    categoryId: string,
    patch: Record<string, unknown>,
): Promise<{ row: CategoryRow } | { error: string }> {
    let workingPatch = { ...patch };
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        for (const select of LOCATION_PROGRAM_CATEGORY_SELECT_ATTEMPTS) {
            const { data, error } = await supabase
                .from("location_program_categories")
                .update(workingPatch)
                .eq("id", categoryId)
                .eq("org_id", orgId)
                .select(select)
                .maybeSingle();
            if (!error) {
                if (!data) return { error: "Program category was not found after save." };
                return { row: mapCategoryRow(data as Record<string, unknown>) };
            }
            lastError = error.message;
            if (isMissingColumnError(error)) {
                const stripped = stripUnavailableProgramCategoryPatchFields(workingPatch, error);
                if (stripped && Object.keys(stripped).length > 1) {
                    workingPatch = stripped;
                    break;
                }
                // Missing select columns only — try a narrower select with same patch.
                continue;
            }
            return { error: error.message };
        }
    }

    return { error: lastError ?? "Failed to update location program category" };
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

    const listed = await listProgramCategoryRows(createAdminClient(), ctx.orgId, {
        locationId: locationId || undefined,
        includeInactive,
    });
    if ("error" in listed) {
        return NextResponse.json({ error: listed.error }, { status: 500 });
    }

    return NextResponse.json({
        categories: listed.rows,
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

        const identity = await readProgramIdentityRevisionId(supabase, ctx.orgId, id);
        if ("error" in identity) {
            return NextResponse.json({ error: identity.error }, { status: 400 });
        }
        if (identity.revisionId && Object.prototype.hasOwnProperty.call(patch, "label")) {
            return NextResponse.json(
                { error: "Published Program identity is managed by the Organization." },
                { status: 409 },
            );
        }

        const updated = await updateProgramCategoryRow(supabase, ctx.orgId, id, patch);
        if ("error" in updated) {
            return NextResponse.json({ error: updated.error }, { status: 400 });
        }
        results.push(updated.row);
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

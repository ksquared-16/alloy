import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { CommercialAddon, AddonType } from "@/lib/commercial/feesAddons";

const SELECT_COLS =
    "id, org_id, location_id, program_key, name, description, addon_type, amount_cents, cadence_key, is_active, metadata, created_at, updated_at";

function mapRow(r: Record<string, unknown>): CommercialAddon {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        location_id: (r.location_id as string | null | undefined) ?? null,
        program_key: (r.program_key as string | null | undefined) ?? null,
        name: String(r.name ?? ""),
        description: (r.description as string | null | undefined) ?? null,
        addon_type: (r.addon_type as AddonType) ?? "other",
        amount_cents: Number(r.amount_cents ?? 0),
        cadence_key: String(r.cadence_key ?? ""),
        is_active: r.is_active !== false,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null | undefined) ?? null,
    };
}

/** GET /api/admin/commercial/addons — returns all add-ons for the org. Optional ?location_id= ?program_key= */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    const { searchParams } = new URL(request.url);
    const locationId = (searchParams.get("location_id") ?? "").trim() || null;
    const programKey = (searchParams.get("program_key") ?? "").trim() || null;

    const supabase = createAdminClient();
    let q = supabase
        .from("commercial_addons")
        .select(SELECT_COLS)
        .eq("org_id", ctx.orgId)
        .order("created_at");

    if (locationId) q = q.eq("location_id", locationId);
    if (programKey) q = q.eq("program_key", programKey);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ addons: (data ?? []).map((r: Record<string, unknown>) => mapRow(r)) });
}

/** POST /api/admin/commercial/addons — create an add-on. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const name = String(body.name ?? "").trim();
    const addon_type = String(body.addon_type ?? "").trim();
    const cadence_key = String(body.cadence_key ?? "").trim();
    const amount_cents = body.amount_cents != null ? Number(body.amount_cents) : null;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!addon_type) return NextResponse.json({ error: "addon_type is required" }, { status: 400 });
    if (!cadence_key) return NextResponse.json({ error: "cadence_key is required" }, { status: 400 });
    if (amount_cents === null || !Number.isFinite(amount_cents) || amount_cents < 0) {
        return NextResponse.json({ error: "amount_cents must be a non-negative integer" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("commercial_addons")
        .insert({
            org_id: ctx.orgId,
            location_id: body.location_id != null ? String(body.location_id).trim() || null : null,
            program_key: body.program_key != null ? String(body.program_key).trim() || null : null,
            name,
            description: body.description != null ? String(body.description).trim() || null : null,
            addon_type,
            amount_cents: Math.round(amount_cents),
            cadence_key,
            is_active: body.is_active !== false,
            metadata: (body.metadata as Record<string, unknown>) ?? {},
        })
        .select(SELECT_COLS)
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ addon: mapRow(data as Record<string, unknown>) }, { status: 201 });
}

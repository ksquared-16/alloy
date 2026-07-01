import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { CommercialDeposit, DepositTiming } from "@/lib/commercial/feesAddons";

const SELECT_COLS =
    "id, org_id, location_id, program_key, name, description, amount_cents, is_refundable, apply_to_balance, due_timing, is_active, metadata, created_at, updated_at";

function mapRow(r: Record<string, unknown>): CommercialDeposit {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        location_id: (r.location_id as string | null | undefined) ?? null,
        program_key: (r.program_key as string | null | undefined) ?? null,
        name: String(r.name ?? ""),
        description: (r.description as string | null | undefined) ?? null,
        amount_cents: Number(r.amount_cents ?? 0),
        is_refundable: r.is_refundable !== false,
        apply_to_balance: r.apply_to_balance === true,
        due_timing: (r.due_timing as DepositTiming) ?? "at_enrollment",
        is_active: r.is_active !== false,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null | undefined) ?? null,
    };
}

/** GET /api/admin/commercial/deposits — returns all deposits for the org. Optional ?location_id= ?program_key= */
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
        .from("commercial_deposits")
        .select(SELECT_COLS)
        .eq("org_id", ctx.orgId)
        .order("created_at");

    if (locationId) q = q.eq("location_id", locationId);
    if (programKey) q = q.eq("program_key", programKey);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deposits: (data ?? []).map((r: Record<string, unknown>) => mapRow(r)) });
}

/** POST /api/admin/commercial/deposits — create a deposit. */
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
    const amount_cents = body.amount_cents != null ? Number(body.amount_cents) : null;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (amount_cents === null || !Number.isFinite(amount_cents) || amount_cents < 0) {
        return NextResponse.json({ error: "amount_cents must be a non-negative integer" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("commercial_deposits")
        .insert({
            org_id: ctx.orgId,
            location_id: body.location_id != null ? String(body.location_id).trim() || null : null,
            program_key: body.program_key != null ? String(body.program_key).trim() || null : null,
            name,
            description: body.description != null ? String(body.description).trim() || null : null,
            amount_cents: Math.round(amount_cents),
            is_refundable: body.is_refundable !== false,
            apply_to_balance: body.apply_to_balance === true,
            due_timing: body.due_timing != null ? String(body.due_timing).trim() : "at_enrollment",
            is_active: body.is_active !== false,
            metadata: (body.metadata as Record<string, unknown>) ?? {},
        })
        .select(SELECT_COLS)
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ deposit: mapRow(data as Record<string, unknown>) }, { status: 201 });
}

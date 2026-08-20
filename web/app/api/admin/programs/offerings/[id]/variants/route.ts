import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import type { ProgramOfferingVariant, QuantityType, VariantStatus } from "@/lib/programs/programOfferingVariants";
import { autoVariantLabel } from "@/lib/programs/programOfferingVariants";

const VALID_QUANTITY_TYPES = new Set<QuantityType>([
    "days", "hours", "sessions", "weeks", "months",
]);

const VALID_STATUSES = new Set<VariantStatus>([
    "active", "draft", "coming_soon", "seasonal", "retired", "archived",
]);

const SELECT_COLS =
    "id, org_id, offering_id, label, quantity_type, quantity_value, sort_order, is_active, status, metadata, created_at, updated_at";

function mapRow(r: Record<string, unknown>): ProgramOfferingVariant {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        offering_id: String(r.offering_id ?? ""),
        label: (r.label as string | null) ?? null,
        quantity_type: (r.quantity_type as QuantityType | null) ?? null,
        quantity_value: r.quantity_value != null ? Number(r.quantity_value) : null,
        sort_order: Number(r.sort_order ?? 100),
        is_active: r.is_active !== false,
        status: (r.status as VariantStatus) ?? "active",
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null) ?? null,
    };
}

/**
 * GET /api/admin/programs/offerings/[id]/variants
 * List all variants for an offering.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    const { id } = await params;
    const supabase = createAdminClient();

    // Verify offering belongs to org
    const { data: offering } = await supabase
        .from("program_offerings")
        .select("id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!offering) return NextResponse.json({ error: "Offering not found" }, { status: 404 });

    const { data, error } = await supabase
        .from("program_offering_variants")
        .select(SELECT_COLS)
        .eq("offering_id", id)
        .eq("org_id", ctx.orgId)
        .order("sort_order")
        .order("quantity_value");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        variants: (data ?? []).map((r: Record<string, unknown>) => mapRow(r)),
    });
}

/**
 * POST /api/admin/programs/offerings/[id]/variants
 * Create a new variant for an offering.
 * Body: { quantity_type?, quantity_value?, label?, sort_order?, status? }
 *
 * If quantity_type and quantity_value are provided, auto-generates a label.
 * If neither, creates a transparent default variant.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }
    if (!["admin", "ops"].includes(ctx.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const quantity_type = body.quantity_type != null
        ? (String(body.quantity_type) as QuantityType)
        : null;
    if (quantity_type !== null && !VALID_QUANTITY_TYPES.has(quantity_type)) {
        return NextResponse.json({ error: "Invalid quantity_type" }, { status: 400 });
    }

    const quantity_value = body.quantity_value != null ? Number(body.quantity_value) : null;
    if (quantity_value !== null && (!Number.isFinite(quantity_value) || quantity_value <= 0)) {
        return NextResponse.json({ error: "quantity_value must be a positive number" }, { status: 400 });
    }

    // Auto-generate label from quantity if not explicitly provided
    const explicitLabel = body.label != null ? String(body.label).trim() : null;
    const label =
        explicitLabel ||
        (quantity_value !== null && quantity_type !== null
            ? autoVariantLabel(quantity_value, quantity_type)
            : null);

    const status: VariantStatus = VALID_STATUSES.has(body.status as VariantStatus)
        ? (body.status as VariantStatus)
        : "active";
    const sort_order =
        typeof body.sort_order === "number" ? body.sort_order : (quantity_value ?? 100) * 10;

    const supabase = createAdminClient();

    // Verify offering belongs to org
    const { data: offering } = await supabase
        .from("program_offerings")
        .select("id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!offering) return NextResponse.json({ error: "Offering not found" }, { status: 404 });

    const { data, error } = await supabase
        .from("program_offering_variants")
        .insert({
            org_id: ctx.orgId,
            offering_id: id,
            label,
            quantity_type,
            quantity_value,
            sort_order,
            status,
        })
        .select(SELECT_COLS)
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json(
                { error: "A variant with this quantity already exists for this offering" },
                { status: 409 },
            );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logAdminAudit({
        entity: "program_offering_variants",
        id: String(data.id),
        changed_fields: ["created"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(
        { variant: mapRow(data as Record<string, unknown>) },
        { status: 201 },
    );
}

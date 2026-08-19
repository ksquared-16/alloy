import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import type { ProgramOffering, AttendanceType, OfferingStatus } from "@/lib/programs/programOfferings";
import { operatorFriendlyProgramOfferingError } from "@/lib/programs/operatorFriendlyProgramOfferingError";

const VALID_ATTENDANCE_TYPES = new Set<AttendanceType>([
    "full_time", "part_time", "drop_in", "hourly", "before_school", "after_school", "custom",
]);

const VALID_STATUSES = new Set<OfferingStatus>([
    "active", "draft", "coming_soon", "seasonal", "retired", "archived",
]);

const SELECT_COLS =
    "id, org_id, program_key, label, attendance_type, status, effective_start, effective_end, sort_order, is_active, metadata, created_at, updated_at";

function mapRow(r: Record<string, unknown>): ProgramOffering {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        program_key: String(r.program_key ?? ""),
        label: String(r.label ?? ""),
        attendance_type: (r.attendance_type as AttendanceType) ?? "full_time",
        status: (r.status as OfferingStatus) ?? "active",
        effective_start: (r.effective_start as string | null) ?? null,
        effective_end: (r.effective_end as string | null) ?? null,
        sort_order: Number(r.sort_order ?? 100),
        is_active: r.is_active !== false,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : {},
        created_at: String(r.created_at ?? ""),
        updated_at: (r.updated_at as string | null) ?? null,
    };
}

/**
 * GET /api/admin/programs/offerings
 * List program offerings for the org.
 * Optional: ?program_key= to filter by program.
 * Optional: ?active_only=true to filter to is_active=true rows.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status },
        );
    }

    const { searchParams } = new URL(request.url);
    const programKey = (searchParams.get("program_key") ?? "").trim() || null;
    const activeOnly = searchParams.get("active_only") === "true";

    const supabase = createAdminClient();
    let q = supabase
        .from("program_offerings")
        .select(SELECT_COLS)
        .eq("org_id", ctx.orgId)
        .order("program_key")
        .order("sort_order")
        .order("label");

    if (programKey) q = q.eq("program_key", programKey);
    if (activeOnly) q = q.eq("is_active", true);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        offerings: (data ?? []).map((r: Record<string, unknown>) => mapRow(r)),
    });
}

/**
 * POST /api/admin/programs/offerings
 * Create a new program offering (attendance type). Ops role required.
 * Automatically creates a default transparent variant for no-quantity types.
 * Body: { program_key, label, attendance_type, status?, sort_order? }
 */
export async function POST(request: NextRequest) {
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

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const program_key = String(body.program_key ?? "").trim();
    const label = String(body.label ?? "").trim();
    const attendance_type = String(body.attendance_type ?? "") as AttendanceType;

    if (!program_key) return NextResponse.json({ error: "program_key is required" }, { status: 400 });
    if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });
    if (!VALID_ATTENDANCE_TYPES.has(attendance_type)) {
        return NextResponse.json({ error: "Invalid attendance_type" }, { status: 400 });
    }

    const status: OfferingStatus = VALID_STATUSES.has(body.status as OfferingStatus)
        ? (body.status as OfferingStatus)
        : "active";
    const sort_order = typeof body.sort_order === "number" ? body.sort_order : 100;
    const effective_start = body.effective_start != null ? String(body.effective_start) : null;
    const effective_end = body.effective_end != null ? String(body.effective_end) : null;
    const metadata =
        body.metadata != null && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {};

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("program_offerings")
        .insert({
            org_id: ctx.orgId,
            program_key,
            label,
            attendance_type,
            status,
            effective_start,
            effective_end,
            sort_order,
            metadata,
        })
        .select(SELECT_COLS)
        .single();

    if (error) {
        return NextResponse.json(
            {
                error: operatorFriendlyProgramOfferingError(
                    error.code === "23505" ? "program_offerings_unique" : error.message,
                    {
                        programLabel: program_key,
                        careFormat: attendance_type,
                        planName: label,
                    },
                ),
            },
            { status: error.code === "23505" ? 409 : 400 },
        );
    }

    const offering = mapRow(data as Record<string, unknown>);

    // Always create a default transparent variant so rates have somewhere to attach.
    const { data: variant } = await supabase
        .from("program_offering_variants")
        .insert({
            org_id: ctx.orgId,
            offering_id: offering.id,
            label: null,
            quantity_type: null,
            quantity_value: null,
            sort_order: 10,
        })
        .select("id")
        .single();

    logAdminAudit({
        entity: "program_offerings",
        id: offering.id,
        changed_fields: ["created"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json(
        { offering, default_variant_id: variant?.id ?? null },
        { status: 201 },
    );
}

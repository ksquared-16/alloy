import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import type { ProgramOffering, AttendanceType, QuantityType, OfferingStatus } from "@/lib/programs/programOfferings";

const VALID_ATTENDANCE_TYPES = new Set<AttendanceType>([
    "full_time", "part_time", "drop_in", "hourly", "before_school", "after_school", "custom",
]);

const VALID_QUANTITY_TYPES = new Set<QuantityType>([
    "days", "hours", "sessions", "weeks", "months",
]);

const VALID_STATUSES = new Set<OfferingStatus>([
    "active", "draft", "coming_soon", "seasonal", "retired", "archived",
]);

function mapRow(r: Record<string, unknown>): ProgramOffering {
    return {
        id: String(r.id ?? ""),
        org_id: String(r.org_id ?? ""),
        program_key: String(r.program_key ?? ""),
        label: String(r.label ?? ""),
        attendance_type: (r.attendance_type as AttendanceType) ?? "full_time",
        quantity_type: (r.quantity_type as QuantityType | null) ?? null,
        quantity_value: r.quantity_value != null ? Number(r.quantity_value) : null,
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
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const programKey = (searchParams.get("program_key") ?? "").trim() || null;
    const activeOnly = searchParams.get("active_only") === "true";

    const supabase = createAdminClient();
    let q = supabase
        .from("program_offerings")
        .select("id, org_id, program_key, label, attendance_type, quantity_type, quantity_value, status, effective_start, effective_end, sort_order, is_active, metadata, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .order("program_key")
        .order("sort_order")
        .order("label");

    if (programKey) q = q.eq("program_key", programKey);
    if (activeOnly) q = q.eq("is_active", true);

    const { data, error } = await q;
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        offerings: (data ?? []).map((r: Record<string, unknown>) => mapRow(r)),
    });
}

/**
 * POST /api/admin/programs/offerings
 * Create a new program offering. Ops role required.
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (!["owner", "admin", "ops"].includes(ctx.role)) {
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

    const quantity_type = body.quantity_type != null
        ? (String(body.quantity_type) as QuantityType)
        : null;
    if (quantity_type != null && !VALID_QUANTITY_TYPES.has(quantity_type)) {
        return NextResponse.json({ error: "Invalid quantity_type" }, { status: 400 });
    }

    const quantity_value = body.quantity_value != null ? Number(body.quantity_value) : null;
    if (quantity_value != null && (!Number.isFinite(quantity_value) || quantity_value <= 0)) {
        return NextResponse.json({ error: "quantity_value must be a positive number" }, { status: 400 });
    }

    const status: OfferingStatus = (VALID_STATUSES.has(body.status as OfferingStatus)
        ? body.status
        : "active") as OfferingStatus;

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
            quantity_type,
            quantity_value,
            status,
            effective_start,
            effective_end,
            sort_order,
            metadata,
        })
        .select("id, org_id, program_key, label, attendance_type, quantity_type, quantity_value, status, effective_start, effective_end, sort_order, is_active, metadata, created_at, updated_at")
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json(
                { error: "An offering with this attendance type and quantity already exists for this program" },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logAdminAudit({
        entity: "program_offerings",
        id: String(data.id),
        changed_fields: ["created"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    return NextResponse.json({ offering: mapRow(data as Record<string, unknown>) }, { status: 201 });
}

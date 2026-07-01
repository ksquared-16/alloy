import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { formatRecurrenceLabel } from "@/lib/adminFormatters";

export type ServicePlanTemplateListItem = {
    id: string;
    plan_name: string | null;
    plan_key: string | null;
    is_recurring: boolean;
    recurrence_unit: string | null;
    recurrence_interval: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
    org_id: string | null;
    vertical_id: string | null;
    _recurrence_label: string | null;
    _recurring_yes_no: boolean;
    _active_yes_no: boolean;
    _updated: string | null;
};

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    const supabase = createAdminClient();
    let q = supabase
        .from("service_plan_templates")
        .select("*", { count: "exact" })
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (ctx.orgId) {
        q = q.eq("org_id", ctx.orgId);
    }

    const { data: rows, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const list = rows ?? [];
    const items: ServicePlanTemplateListItem[] = list.map((r) => {
        const row = r as Record<string, unknown> & {
            recurrence_unit?: string | null;
            recurrence_interval?: number | null;
            updated_at?: string | null;
            created_at: string;
            is_recurring?: boolean;
            is_active?: boolean;
        };
        const _updated = (row.updated_at as string) ?? (row.created_at as string) ?? null;
        const _recurrence_label = formatRecurrenceLabel(
            (row.recurrence_unit as string) ?? null,
            row.recurrence_interval != null ? Number(row.recurrence_interval) : null
        );
        return {
            id: row.id as string,
            plan_name: (row.plan_name as string) ?? null,
            plan_key: (row.plan_key as string) ?? null,
            is_recurring: !!row.is_recurring,
            recurrence_unit: (row.recurrence_unit as string) ?? null,
            recurrence_interval: row.recurrence_interval != null ? Number(row.recurrence_interval) : null,
            is_active: !!row.is_active,
            created_at: (row.created_at as string) ?? "",
            updated_at: (row.updated_at as string) ?? null,
            org_id: (row.org_id as string) ?? null,
            vertical_id: (row.vertical_id as string) ?? null,
            _recurrence_label,
            _recurring_yes_no: !!row.is_recurring,
            _active_yes_no: !!row.is_active,
            _updated,
        };
    });

    return NextResponse.json({ service_plan_templates: items, total: count ?? items.length });
}

const RECURRENCE_UNITS = ["day", "week", "month", "quarter", "year"] as const;

/** POST: create a plan template. Body: plan_name, plan_key, is_recurring?, recurrence_unit?, recurrence_interval?, is_active? */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    let body: { plan_name?: string; plan_key?: string; is_recurring?: boolean; recurrence_unit?: string | null; recurrence_interval?: number | null; is_active?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const plan_name = typeof body.plan_name === "string" ? body.plan_name.trim() || null : null;
    const plan_key = typeof body.plan_key === "string" ? body.plan_key.trim() || null : null;
    if (!plan_name && !plan_key) return NextResponse.json({ error: "plan_name or plan_key required" }, { status: 400 });

    const unit = typeof body.recurrence_unit === "string" && body.recurrence_unit.trim()
        ? (body.recurrence_unit.trim().toLowerCase() as string)
        : null;
    const validUnit = unit && RECURRENCE_UNITS.includes(unit as (typeof RECURRENCE_UNITS)[number]) ? unit : null;
    const interval = body.recurrence_interval != null ? Math.max(1, Number(body.recurrence_interval) || 1) : 1;

    const supabase = createAdminClient();
    const insert: Record<string, unknown> = {
        plan_name: plan_name ?? undefined,
        plan_key: plan_key ?? undefined,
        is_recurring: !!body.is_recurring,
        recurrence_unit: validUnit,
        recurrence_interval: validUnit ? interval : null,
        is_active: body.is_active !== false,
    };
    if (ctx.orgId) insert.org_id = ctx.orgId;

    const { data, error } = await supabase.from("service_plan_templates").insert(insert).select("id, plan_name, plan_key, is_recurring, recurrence_unit, recurrence_interval, is_active, created_at, updated_at, org_id, vertical_id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? {});
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

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

function recurrenceLabel(unit: string | null, interval: number | null): string | null {
    if (!unit || interval == null || interval < 1) return null;
    const i = Math.max(1, Number(interval) || 1);
    if (unit === "week" && i === 1) return "Weekly";
    if (unit === "week") return `Every ${i} weeks`;
    if (unit === "month" && i === 1) return "Monthly";
    if (unit === "month") return `Every ${i} months`;
    return `${i} ${unit}(s)`;
}

export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
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
        const _recurrence_label = recurrenceLabel(
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

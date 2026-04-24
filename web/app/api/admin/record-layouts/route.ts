import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

const ALLOWED = new Set(["job", "schedule", "opportunity"]);

/**
 * GET: effective drawer record layout for a logical entity type (admin).
 *
 * Resolution order:
 * - Prefer active org-scoped override from `record_drawer_layouts` (surface=drawer, key=default).
 * - Fallback to global templates in `record_layouts` (existing behavior).
 *
 * Returns { layouts: RecordLayoutRow[] } to preserve existing hook consumers.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const entityType = (request.nextUrl.searchParams.get("entity_type") ?? "").trim().toLowerCase();
    if (!entityType || !ALLOWED.has(entityType)) {
        return NextResponse.json({ error: "entity_type must be job, schedule, or opportunity" }, { status: 400 });
    }

    const supabase = createAdminClient();
    // 1) Org-scoped override (drawer)
    const { data: orgRow, error: orgErr } = await supabase
        .from("record_drawer_layouts")
        .select("id, org_id, entity_type, surface, key, config_json, is_active, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entityType)
        .eq("surface", "drawer")
        .eq("key", "default")
        .eq("is_active", true)
        .maybeSingle();

    if (orgErr) {
        return NextResponse.json({ error: orgErr.message }, { status: 500 });
    }

    if (orgRow) {
        // Shape-match existing RecordLayoutRow consumer expectations.
        const layout = {
            id: orgRow.id as string,
            entity_type: orgRow.entity_type as string,
            key: orgRow.key as string,
            config_json: (orgRow as { config_json?: Record<string, unknown> }).config_json ?? {},
            is_active: Boolean((orgRow as { is_active?: boolean }).is_active),
            created_at: (orgRow as { created_at?: string }).created_at ?? new Date().toISOString(),
        };
        return NextResponse.json({ layouts: [layout] });
    }

    // 2) Global fallback templates
    const { data, error } = await supabase
        .from("record_layouts")
        .select("id, entity_type, key, config_json, is_active, created_at")
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ layouts: data ?? [] });
}

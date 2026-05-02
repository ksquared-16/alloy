import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

const ALLOWED = new Set(["job", "schedule", "opportunity"]);

/** GET: list active record actions for a logical entity type (admin). */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const entityType = (request.nextUrl.searchParams.get("entity_type") ?? "").trim().toLowerCase();
    if (!entityType || !ALLOWED.has(entityType)) {
        return NextResponse.json({ error: "entity_type must be job, schedule, or opportunity" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("record_actions")
        .select("id, entity_type, action_key, label, event_key, placement, is_active, created_at")
        .eq("entity_type", entityType)
        .eq("is_active", true)
        .order("placement", { ascending: true })
        .order("created_at", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ actions: data ?? [] });
}

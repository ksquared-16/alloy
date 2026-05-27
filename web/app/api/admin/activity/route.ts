import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { enrichActivityEventsWithCommunicationChannels } from "@/lib/admin/enrichActivityEventsWithCommunicationChannels";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";

/** Map common singular aliases to plural workflow_events.entity_type. */
function normalizeEntityTypeParam(raw: string): string | null {
    const s = raw.trim().toLowerCase();
    if (!s) return null;
    if (s === "opportunity") return "opportunities";
    if (s === "customer") return "customers";
    if (s === "job") return "jobs";
    if (s === "schedule") return "schedules";
    if (s === "contact") return "contacts";
    return s;
}

/** GET /api/admin/activity — workflow_events for one entity, newest first. */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const entityTypeRaw = (searchParams.get("entity_type") ?? "").trim();
    const entityId = (searchParams.get("entity_id") ?? "").trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 500);

    const entityType = normalizeEntityTypeParam(entityTypeRaw);
    if (!entityType || !entityId) {
        return NextResponse.json({ error: "entity_type and entity_id are required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("workflow_events")
        .select("id, occurred_at, event_type, entity_type, entity_id, action_type, payload")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("occurred_at", { ascending: false })
        .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const events = await enrichActivityEventsWithCommunicationChannels(supabase, ctx.orgId, rows ?? []);

    return NextResponse.json({ events });
}

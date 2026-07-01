import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";

export type WorkflowEventRow = {
    id: string;
    occurred_at: string;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
    action_type: string | null;
    payload: Record<string, unknown>;
    created_at?: string | null;
};

/** GET: list workflow_events for caller org. Query: event_type, search, range=24h|7d|30d, page, limit.
 *  Use ?list=event_types to return distinct event_type values for the org (for filter dropdown).
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const orgId = ctx.orgId;

    const { searchParams } = new URL(request.url);
    const list = searchParams.get("list");
    if (list === "event_types") {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("workflow_events")
            .select("event_type")
            .eq("org_id", orgId)
            .not("event_type", "is", null)
            .order("event_type", { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const types = [...new Set((data ?? []).map((r) => (r as { event_type: string }).event_type).filter(Boolean))];
        return NextResponse.json({ event_types: types });
    }

    const eventType = searchParams.get("event_type") ?? "";
    const eventId = (searchParams.get("event_id") ?? "").trim();
    const search = (searchParams.get("search") ?? "").trim();
    const range = searchParams.get("range") ?? ""; // 24h | 7d | 30d
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const offset = (page - 1) * limit;

    let fromIso: string | null = null;
    if (range === "24h") {
        const d = new Date();
        d.setHours(d.getHours() - 24);
        fromIso = d.toISOString();
    } else if (range === "7d") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        fromIso = d.toISOString();
    } else if (range === "30d") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        fromIso = d.toISOString();
    }

    const supabase = createAdminClient();
    let q = supabase
        .from("workflow_events")
        .select("id, occurred_at, event_type, entity_type, entity_id, action_type, payload", { count: "exact" })
        .eq("org_id", orgId)
        .order("occurred_at", { ascending: false });

    if (eventType) q = q.eq("event_type", eventType);
    if (eventId) q = q.eq("id", eventId);
    if (fromIso) q = q.gte("occurred_at", fromIso);

    if (search) {
        const fetchSize = 1000;
        const { data: rows, error } = await q.limit(fetchSize);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const searchLower = search.toLowerCase();
        const all: WorkflowEventRow[] = (rows ?? []).map((r) => ({
            id: r.id,
            occurred_at: r.occurred_at,
            event_type: r.event_type ?? null,
            entity_type: r.entity_type ?? null,
            entity_id: r.entity_id ?? null,
            action_type: r.action_type ?? null,
            payload: (r.payload as Record<string, unknown>) ?? {},
        }));
        const filtered = all.filter(
            (e) =>
                (e.entity_id && e.entity_id.toLowerCase().includes(searchLower)) ||
                JSON.stringify(e.payload).toLowerCase().includes(searchLower)
        );
        const events = filtered.slice(offset, offset + limit);
        return NextResponse.json({ events, total: filtered.length, page, limit });
    }

    const { data: rows, error, count } = await q.range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const events: WorkflowEventRow[] = (rows ?? []).map((r) => ({
        id: r.id,
        occurred_at: r.occurred_at,
        event_type: r.event_type ?? null,
        entity_type: r.entity_type ?? null,
        entity_id: r.entity_id ?? null,
        action_type: r.action_type ?? null,
        payload: (r.payload as Record<string, unknown>) ?? {},
    }));

    return NextResponse.json({
        events,
        total: count ?? events.length,
        page,
        limit,
    });
}

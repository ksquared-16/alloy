import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";

export type WorkflowRunRow = {
    id: string;
    workflow_id: string;
    workflow_name: string | null;
    event_id: string | null;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
    status: string;
    error: string | null;
    started_at: string;
    completed_at: string | null;
    event_payload: Record<string, unknown>;
    /** True if any workflow_action_run for this run has status 'failed'. */
    has_failed_action?: boolean;
};

/** GET: list workflow_runs for caller org. Enriches with workflow name and event_type/entity_type/entity_id from workflow_events. */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const orgId = ctx.orgId;

    const { searchParams } = new URL(request.url);
    const list = searchParams.get("list");

    if (list === "workflows") {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("workflows")
            .select("id, name")
            .eq("org_id", orgId)
            .order("name", { ascending: true });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const workflows = (data ?? []).map((w) => ({ id: (w as { id: string }).id, name: (w as { name: string | null }).name ?? "—" }));
        return NextResponse.json({ workflows });
    }

    if (list === "event_types") {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("workflow_events")
            .select("event_type")
            .eq("org_id", orgId)
            .not("event_type", "is", null);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const types = [...new Set((data ?? []).map((r) => (r as { event_type: string }).event_type).filter(Boolean))].sort();
        return NextResponse.json({ event_types: types });
    }

    const status = searchParams.get("status") ?? "";
    const workflowId = searchParams.get("workflow_id") ?? "";
    const eventType = searchParams.get("event_type") ?? "";
    const range = searchParams.get("range") ?? "";
    const search = (searchParams.get("search") ?? "").trim();
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

    let eventIdsForType: string[] | null = null;
    if (eventType) {
        const { data: evRows } = await supabase
            .from("workflow_events")
            .select("id")
            .eq("org_id", orgId)
            .eq("event_type", eventType);
        eventIdsForType = (evRows ?? []).map((r) => (r as { id: string }).id);
        if (eventIdsForType.length === 0) {
            return NextResponse.json({ runs: [], total: 0, page, limit });
        }
    }

    let q = supabase
        .from("workflow_runs")
        .select("id, workflow_id, event_id, status, error, started_at, completed_at, event_payload", { count: "exact" })
        .eq("org_id", orgId)
        .order("started_at", { ascending: false });

    if (status) q = q.eq("status", status);
    if (workflowId) q = q.eq("workflow_id", workflowId);
    if (fromIso) q = q.gte("started_at", fromIso);
    if (eventIdsForType && eventIdsForType.length > 0) q = q.in("event_id", eventIdsForType);

    async function enrichRuns(
        rows: {
            id: string;
            workflow_id: string;
            event_id: string | null;
            status: string;
            error: string | null;
            started_at: string;
            completed_at: string | null;
            event_payload: unknown;
        }[]
    ) {
        const wfIds = [...new Set(rows.map((r) => r.workflow_id).filter(Boolean))];
        const evIds = [...new Set(rows.map((r) => r.event_id).filter(Boolean))] as string[];
        const { data: wfData } = wfIds.length
            ? await supabase.from("workflows").select("id, name").eq("org_id", orgId).in("id", wfIds)
            : { data: [] };
        const { data: evData } = evIds.length
            ? await supabase.from("workflow_events").select("id, event_type, entity_type, entity_id").eq("org_id", orgId).in("id", evIds)
            : { data: [] };
        const wfMap = new Map((wfData ?? []).map((w) => [(w as { id: string }).id, (w as { name: string | null }).name ?? null]));
        const evMap = new Map((evData ?? []).map((e) => [(e as { id: string }).id, e as { event_type: string | null; entity_type: string | null; entity_id: string | null }]));
        const runIds = rows.map((r) => r.id);
        let runIdsWithFailedAction = new Set<string>();
        if (runIds.length > 0) {
            const { data: failedRows } = await supabase
                .from("workflow_action_runs")
                .select("workflow_run_id")
                .eq("org_id", orgId)
                .in("workflow_run_id", runIds)
                .eq("status", "failed");
            runIdsWithFailedAction = new Set((failedRows ?? []).map((r) => (r as { workflow_run_id: string }).workflow_run_id));
        }
        return rows.map((r) => ({
            id: r.id,
            workflow_id: r.workflow_id,
            workflow_name: wfMap.get(r.workflow_id) ?? null,
            event_id: r.event_id,
            event_type: r.event_id ? (evMap.get(r.event_id)?.event_type ?? null) : null,
            entity_type: r.event_id ? (evMap.get(r.event_id)?.entity_type ?? null) : null,
            entity_id: r.event_id ? (evMap.get(r.event_id)?.entity_id ?? null) : null,
            status: r.status,
            error: r.error,
            started_at: r.started_at,
            completed_at: r.completed_at,
            event_payload: (r.event_payload as Record<string, unknown>) ?? {},
            has_failed_action: runIdsWithFailedAction.has(r.id),
        }));
    }

    if (search) {
        const { data: rows, error } = await q.limit(1000);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const raw = (rows ?? []) as {
            id: string;
            workflow_id: string;
            event_id: string | null;
            status: string;
            error: string | null;
            started_at: string;
            completed_at: string | null;
            event_payload: unknown;
        }[];
        const enriched = await enrichRuns(raw);
        const searchLower = search.toLowerCase();
        const filtered = enriched.filter(
            (r) =>
                r.id.toLowerCase().includes(searchLower) ||
                (r.error && r.error.toLowerCase().includes(searchLower)) ||
                JSON.stringify(r.event_payload).toLowerCase().includes(searchLower) ||
                (r.entity_id && r.entity_id.toLowerCase().includes(searchLower))
        );
        const runs = filtered.slice(offset, offset + limit);
        return NextResponse.json({ runs, total: filtered.length, page, limit });
    }

    const { data: rows, error, count } = await q.range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const raw = (rows ?? []) as {
        id: string;
        workflow_id: string;
        event_id: string | null;
        status: string;
        error: string | null;
        started_at: string;
        completed_at: string | null;
        event_payload: unknown;
    }[];
    const runs = await enrichRuns(raw);
    return NextResponse.json({
        runs,
        total: count ?? runs.length,
        page,
        limit,
    });
}

import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";

function agentV1RecordLayoutEnabled(): boolean {
    const v = process.env.AGENT_V1_RECORD_LAYOUT_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

type ProposalRow = {
    proposal_id: string;
    request_id: string;
    correlation_id: string;
    intent_json: unknown;
    record_overview_layout_id: string;
    created_at: string;
};

type ApplyAuditRow = {
    result_id: string;
    proposal_id: string;
    org_id: string;
    user_id: string;
    record_overview_layout_id: string;
    terminal_status: string;
    applied_config_version: number;
    created_at: string;
};

type LayoutRow = {
    id: string;
    entity_type: string;
    surface: string;
};

/**
 * GET — list recent agent v1 record overview layout apply actions (audit join) for the current org.
 * Query: `limit` (1–50, default 50).
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (!agentV1RecordLayoutEnabled()) {
        return NextResponse.json({ ok: false, error: "FEATURE_DISABLED", message: "Agent v1 record layout is disabled" }, { status: 403 });
    }

    const rawLimit = request.nextUrl.searchParams.get("limit");
    const parsed = rawLimit != null ? Number.parseInt(rawLimit, 10) : 50;
    const limit = Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 50;

    const supabase = createAdminClient();

    const { data: audits, error: auditErr } = await supabase
        .from("agent_v1_record_layout_apply_audit")
        .select(
            "result_id, proposal_id, org_id, user_id, record_overview_layout_id, terminal_status, applied_config_version, created_at"
        )
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (auditErr) {
        console.error("[ai-activity] apply audit list:", auditErr);
        return NextResponse.json({ ok: false, error: "LIST_FAILED", message: auditErr.message }, { status: 500 });
    }

    const list = (Array.isArray(audits) ? audits : []) as ApplyAuditRow[];
    if (list.length === 0) {
        return NextResponse.json({ ok: true, org_id: ctx.orgId, items: [] });
    }

    const proposalIds = [...new Set(list.map((a) => a.proposal_id))];

    const { data: proposals, error: propErr } = await supabase
        .from("agent_v1_record_layout_proposals")
        .select("proposal_id, request_id, correlation_id, intent_json, record_overview_layout_id, created_at")
        .in("proposal_id", proposalIds)
        .eq("org_id", ctx.orgId);

    if (propErr) {
        console.error("[ai-activity] proposals:", propErr);
        return NextResponse.json({ ok: false, error: "LIST_FAILED", message: propErr.message }, { status: 500 });
    }

    const propMap = new Map((Array.isArray(proposals) ? proposals : []).map((p) => [(p as ProposalRow).proposal_id, p as ProposalRow]));

    const layoutIds = [...new Set(list.map((a) => a.record_overview_layout_id))];
    const { data: layouts, error: layErr } = await supabase
        .from("record_overview_layouts")
        .select("id, entity_type, surface")
        .in("id", layoutIds)
        .eq("org_id", ctx.orgId);

    if (layErr) {
        console.error("[ai-activity] layouts:", layErr);
        return NextResponse.json({ ok: false, error: "LIST_FAILED", message: layErr.message }, { status: 500 });
    }

    const layoutMap = new Map((Array.isArray(layouts) ? layouts : []).map((l) => [(l as LayoutRow).id, l as LayoutRow]));

    const items = list.map((a) => {
        const p = propMap.get(a.proposal_id);
        const layout = layoutMap.get(a.record_overview_layout_id);
        const intent = (p?.intent_json ?? {}) as Record<string, unknown>;
        const slots = (intent.slots as Record<string, unknown> | undefined) ?? {};
        const intentType = typeof intent.intent_type === "string" ? intent.intent_type : "update_record_layout";
        const msgRaw = intent.message;
        const requestText = typeof msgRaw === "string" && msgRaw.trim() ? msgRaw.trim() : null;
        const summaryParts: string[] = [];
        if (typeof slots.entity_type === "string") summaryParts.push(slots.entity_type);
        if (typeof slots.surface === "string") summaryParts.push(slots.surface);
        const outcomeSummary =
            a.terminal_status === "success"
                ? `Applied config v${a.applied_config_version}`
                : `Status: ${a.terminal_status}`;

        return {
            id: a.result_id,
            result_id: a.result_id,
            proposal_id: a.proposal_id,
            request_id: p?.request_id ?? "",
            correlation_id: p?.correlation_id ?? "",
            created_at: a.created_at,
            proposed_at: p?.created_at ?? a.created_at,
            org_id: a.org_id,
            user_id: a.user_id,
            agent_domain: "agent_v1" as const,
            intent_type: intentType,
            target_kind: typeof slots.target_kind === "string" ? slots.target_kind : "record_overview_layout",
            entity_type: layout?.entity_type ?? (typeof slots.entity_type === "string" ? slots.entity_type : ""),
            surface: layout?.surface ?? (typeof slots.surface === "string" ? slots.surface : ""),
            status: mapTerminalStatus(a.terminal_status),
            terminal_status: a.terminal_status,
            applied_config_version: a.applied_config_version,
            request_text: requestText,
            outcome_summary: outcomeSummary,
            intent_json: p?.intent_json ?? null,
        };
    });

    return NextResponse.json({ ok: true, org_id: ctx.orgId, items });
}

function mapTerminalStatus(terminal: string): "applied" | "failed" | "unknown" {
    if (terminal === "success") return "applied";
    if (terminal === "failed") return "failed";
    return "unknown";
}

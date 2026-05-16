import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { fetchWorkflowAssistExplainV1 } from "@/lib/agent/workflowAssist/workflowAssistOperationalTraceFetch";
import {
    parseWorkflowAssistExplainRequest,
    workflowAssistExplainApiFailure,
} from "@/lib/agent/workflowAssist/workflowAssistExplainV1";
import { workflowAssistErrorEnvelope } from "@/lib/agent/workflowAssist/workflowAssistReadV1";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET `/api/admin/ai/workflow-assist/explain` — deterministic Explain v1 with operational trace (read-only).
 *
 * **Gates:** `requireAdminOrOps` + org context (same as workflow_events / workflow_runs list).
 * Does not mutate workflows or require `workflow_assist_draft` AI policy.
 *
 * Query: `entity_type`, `entity_id`, optional `workflow_id`, `event_type`, `range` (`24h`|`7d`|`30d`).
 * Response: `{ ok, explain_engine: 1, explanation, trace }`.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const parsed = parseWorkflowAssistExplainRequest(new URL(request.url).searchParams);
    if (!parsed.ok) {
        return NextResponse.json(
            workflowAssistExplainApiFailure(parsed.error, parsed.message),
            { status: parsed.status }
        );
    }

    try {
        const supabase = createAdminClient();
        const { explanation, trace } = await fetchWorkflowAssistExplainV1(supabase, ctx.orgId, parsed.request);
        return NextResponse.json({ ok: true, explain_engine: 1 as const, explanation, trace });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Explain request failed.";
        console.error("[workflow-assist/explain]", message);
        return NextResponse.json(
            workflowAssistExplainApiFailure(
                "EXPLAIN_FETCH_FAILED",
                message,
                workflowAssistErrorEnvelope("fetch_failed", message, 500)
            ),
            { status: 500 }
        );
    }
}

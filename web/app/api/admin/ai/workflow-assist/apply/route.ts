import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdmin } from "@/lib/adminAuth";
import { executeWorkflowAssistApply } from "@/lib/agent/workflowAssist/workflowAssistApplyFromSuggestion";
import {
    parseWorkflowAssistApplyRequest,
    validateWorkflowAssistSuggestionSemantics,
} from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST `/api/admin/ai/workflow-assist/apply` — admin-only apply for Workflow Assist proposals (Card 5).
 *
 * **Gate:** `requireAdmin` only (ops cannot apply workflow mutations).
 *
 * **Body:** {@link import("@/lib/agent/workflowAssist/workflowAssistProposalV1").WorkflowAssistApplyRequestV1}
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const parsed = parseWorkflowAssistApplyRequest(body);
    if (!parsed.ok) {
        return NextResponse.json(
            {
                ok: false,
                error: parsed.error,
                message: parsed.message,
                validation_errors: parsed.validation_errors ?? null,
            },
            { status: parsed.status }
        );
    }

    const { proposal } = parsed.value;
    if (proposal.org_id !== ctx.orgId || proposal.actor_user_id !== ctx.userId) {
        return NextResponse.json(
            { ok: false, error: "SESSION_MISMATCH", message: "Proposal org or actor does not match session." },
            { status: 403 }
        );
    }

    const sem = validateWorkflowAssistSuggestionSemantics(proposal);
    if (!sem.ok) {
        return NextResponse.json(
            {
                ok: false,
                error: "INVALID_PROPOSAL",
                message: "Proposal failed semantic validation.",
                validation_errors: sem.errors,
            },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const exec = await executeWorkflowAssistApply({ supabase, ctx, proposal });
    if (!exec.ok) {
        return NextResponse.json(
            { ok: false, error: exec.error, message: exec.message },
            { status: exec.status }
        );
    }

    const success = {
        ok: true as const,
        suggestion_id: proposal.suggestion_id,
        proposal_kind: proposal.proposal_kind,
        workflow_id: exec.workflow_id,
        workflow: exec.workflow,
        audit: {
            source: "workflow_assist_apply_v1" as const,
            actor_user_id: ctx.userId,
            org_id: ctx.orgId,
        },
    };

    return NextResponse.json(success);
}

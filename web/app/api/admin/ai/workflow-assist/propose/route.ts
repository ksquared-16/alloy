import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireAdmin } from "@/lib/adminAuth";
import {
    buildWorkflowAssistSuggestionV1,
    parseWorkflowAssistProposeRequest,
} from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { isAiEnrichmentStubEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import { computeOpenAiLiveInvocationPermitted, resolveAiEnrichmentPortalAccess } from "@/lib/ai/aiEnrichmentPermissions";
import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import {
    evaluateOrgPolicyForOpenAiWorkflowAssistProposeRoute,
    evaluateOrgPolicyForStubWorkflowAssistProposeRoute,
} from "@/lib/ai/aiEnrichmentRouteGuards";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST `/api/admin/ai/workflow-assist/propose` — deterministic Workflow Assist proposal (Cards 4–5).
 *
 * **Gates:** `requireAdmin` (ops excluded); then same portal + org `ai_policy` pattern as Task Assist propose
 * (`workflow_assist_draft` feature; stub requires `AI_ENRICHMENT_STUB_ENABLED`; openai branch is policy-only — no LLM).
 *
 * **Body:** {@link import("@/lib/agent/workflowAssist/workflowAssistProposalV1").WorkflowAssistProposeRequestV1}
 *
 * **No mutations** to `workflows` in this handler.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    const portal = resolveAiEnrichmentPortalAccess({ ctx, access });
    if (!portal.ok) {
        return NextResponse.json(
            { ok: false, error: portal.error, message: portal.message },
            { status: portal.status }
        );
    }

    const openaiLiveInvocationPermitted = computeOpenAiLiveInvocationPermitted(access);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const parsed = parseWorkflowAssistProposeRequest(body);
    if (!parsed.ok) {
        return NextResponse.json(
            { ok: false, error: parsed.error, message: parsed.message },
            { status: parsed.status }
        );
    }

    const supabase = createAdminClient();
    const { data: orgSettings, error: orgErr } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (orgErr) {
        console.error("[workflow-assist/propose] org_settings", orgErr);
        return NextResponse.json({ ok: false, error: "ORG_SETTINGS_LOAD_FAILED" }, { status: 500 });
    }

    const org_metadata = orgSettings?.metadata ?? {};
    const policyQuick = parseAiPolicyFromMetadata(org_metadata);

    if (policyQuick.provider === "openai") {
        if (!openaiLiveInvocationPermitted) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "AI_OPENAI_FORBIDDEN",
                    message:
                        "Workflow Assist (openai policy branch) requires AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true and permission ai.enrichment.use.",
                },
                { status: 403 }
            );
        }
        const policyGate = evaluateOrgPolicyForOpenAiWorkflowAssistProposeRoute(org_metadata);
        if (!policyGate.ok) {
            return NextResponse.json(
                { ok: false, error: policyGate.error, message: policyGate.message },
                { status: 403 }
            );
        }
    } else if (policyQuick.provider === "stub") {
        if (!isAiEnrichmentStubEnvEnabled()) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "FEATURE_DISABLED",
                    message: "Set AI_ENRICHMENT_STUB_ENABLED=true to enable Workflow Assist stub policy routes.",
                },
                { status: 403 }
            );
        }
        const policyGate = evaluateOrgPolicyForStubWorkflowAssistProposeRoute(org_metadata);
        if (!policyGate.ok) {
            return NextResponse.json(
                { ok: false, error: policyGate.error, message: policyGate.message },
                { status: 403 }
            );
        }
    } else {
        return NextResponse.json(
            {
                ok: false,
                error: "AI_POLICY_PROVIDER",
                message: "Workflow Assist requires ai_policy.provider stub or openai with workflow_assist_draft allowed.",
            },
            { status: 403 }
        );
    }

    const scope_labels =
        body != null && typeof body === "object" && !Array.isArray(body) ?
            {
                department_name:
                    typeof (body as { scope_labels?: { department_name?: unknown } }).scope_labels?.department_name ===
                    "string" ?
                        (body as { scope_labels: { department_name: string } }).scope_labels.department_name
                    :   null,
                work_unit_name:
                    typeof (body as { scope_labels?: { work_unit_name?: unknown } }).scope_labels?.work_unit_name ===
                    "string" ?
                        (body as { scope_labels: { work_unit_name: string } }).scope_labels.work_unit_name
                    :   null,
            }
        :   undefined;

    let edit_before = null;
    if (parsed.value.proposal_kind === "edit_workflow" || parsed.value.proposal_kind === "pause_workflow") {
        const wid = parsed.value.workflow_id;
        const { data: wfRow } = await supabase
            .from("workflows")
            .select("name, description, enabled, event_type, entity_type")
            .eq("id", wid)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (wfRow && typeof wfRow === "object") {
            edit_before = wfRow;
        }
    }

    const suggestion = buildWorkflowAssistSuggestionV1({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        parsed: parsed.value,
        scope_labels,
        edit_before,
    });

    return NextResponse.json({ ok: true, suggestion });
}

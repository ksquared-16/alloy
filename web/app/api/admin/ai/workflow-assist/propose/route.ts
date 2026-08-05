import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireAdmin } from "@/lib/adminAuth";
import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import { enrichWorkflowAssistCreateSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistEnrichCreateProposalV1";
import {
    buildWorkflowAssistSuggestionV1,
    parseWorkflowAssistProposeRequest,
} from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { completeTrustAuthorization, resolveTrustAccessAuthorization } from "@/lib/ai/resolveTrustAuthorization";
import { trustAuthorizationRefusalResponse } from "@/lib/ai/trustAuthorizationHttp";
import {
    findWorkflowAssistDuplicates,
    type WorkflowAssistDuplicateProbeRowV1,
} from "@/lib/agent/workflowAssist/workflowAssistDuplicateDetectionV1";
import { parseWorkflowScopeFromMetadata } from "@/lib/workflows/workflowScopeMetadata";
import type { WorkflowAssistWorkflowMetadataV1 } from "@/lib/workflows/workflowScopeMetadata";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST `/api/admin/ai/workflow-assist/propose` — deterministic Workflow Assist proposal (Cards 4–5).
 *
 * **Gates:** `requireAdmin` (ops excluded — this route's own access authority), then the canonical Trust
 * authorization seam (`resolveTrustAccessAuthorization` then `completeTrustAuthorization`, consumer
 * `workflow_assist_propose`). This route branches on no `ai_policy` authority of its own. The openai policy
 * branch is policy-only — no LLM.
 *
 * **Body:** {@link import("@/lib/agent/workflowAssist/workflowAssistProposalV1").WorkflowAssistProposeRequestV1}
 *
 * **No mutations** to `workflows` in this handler.
 */
export async function POST(request: NextRequest) {
    // Route access authority, owned by `lib/adminAuth`. Intentionally NOT part of
    // the Trust authorization seam: it is this route's own admin-only rule (ops
    // excluded), it runs before any context resolution, and no other consumer
    // has it. Converging it would change who may reach the other two routes.
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    // Stage 1 of the canonical authorization seam: identity, org context, portal.
    const gate = resolveTrustAccessAuthorization({
        consumer: "workflow_assist_propose",
        ctx: await getAdminContextCached(),
        access: await getAdminAccessContextCached(),
    });
    if (!gate.ok) return trustAuthorizationRefusalResponse(gate.decision)!;
    const { ctx } = gate;

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

    // Stage 2: organization policy, reasoning mode, provider availability.
    // The route branches on nothing itself.
    const authorization = completeTrustAuthorization({ accessDecision: gate.decision, orgMetadata: org_metadata });
    if (!authorization.permitted) return trustAuthorizationRefusalResponse(authorization)!;

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

    let suggestion = buildWorkflowAssistSuggestionV1({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        parsed: parsed.value,
        scope_labels,
        edit_before,
    });

    if (parsed.value.proposal_kind === "create_workflow") {
        const bodyRec = body != null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
        const source_command = typeof bodyRec.source_command === "string" ? bodyRec.source_command.trim().slice(0, 500) : "";
        const templateRaw = bodyRec.template_id;
        const template_id: WorkflowAssistCreateTemplateIdV1 =
            templateRaw === "tour_reminder" || templateRaw === "enrollment_when_move" || templateRaw === "generic_stub" ?
                templateRaw
            :   ((suggestion.draft_row?.metadata as { workflow_assist?: { template_id?: string } } | undefined)
                    ?.workflow_assist?.template_id === "tour_reminder" ?
                    "tour_reminder"
                :   (suggestion.draft_row?.metadata as { workflow_assist?: { template_id?: string } } | undefined)
                        ?.workflow_assist?.template_id === "enrollment_when_move" ?
                    "enrollment_when_move"
                :   "generic_stub");
        const leadRaw = bodyRec.lead_days_before_tour;
        const lead_days_before_tour =
            typeof leadRaw === "number" && Number.isFinite(leadRaw) ? Math.min(30, Math.max(1, Math.floor(leadRaw))) : null;
        const interpreted = bodyRec.interpreted;
        const interpretedShape =
            interpreted != null && typeof interpreted === "object" && !Array.isArray(interpreted) ?
                {
                    trigger_label:
                        typeof (interpreted as { trigger_label?: unknown }).trigger_label === "string" ?
                            (interpreted as { trigger_label: string }).trigger_label
                        :   undefined,
                    actions_label:
                        typeof (interpreted as { actions_label?: unknown }).actions_label === "string" ?
                            (interpreted as { actions_label: string }).actions_label
                        :   undefined,
                    unknowns:
                        Array.isArray((interpreted as { unknowns?: unknown }).unknowns) ?
                            (interpreted as { unknowns: unknown[] }).unknowns.filter((u): u is string => typeof u === "string")
                        :   [],
                }
            :   undefined;

        suggestion = enrichWorkflowAssistCreateSuggestionV1({
            suggestion,
            template_id,
            source_command,
            lead_days_before_tour,
            scope_label: suggestion.scope_display?.label ?? null,
            interpreted: interpretedShape?.trigger_label ?
                {
                    trigger_label: interpretedShape.trigger_label,
                    actions_label: interpretedShape.actions_label ?? "Review actions in Automations",
                    unknowns: interpretedShape.unknowns ?? [],
                }
            :   undefined,
            org_metadata,
            enrichment_enabled: true,
        });

        const { data: existingRows } = await supabase
            .from("workflows")
            .select("id, name, enabled, event_type, entity_type, metadata")
            .eq("org_id", ctx.orgId);

        const draftMeta = suggestion.draft_row?.metadata as WorkflowAssistWorkflowMetadataV1 | undefined;
        const duplicate_warning = findWorkflowAssistDuplicates(
            (existingRows ?? []) as WorkflowAssistDuplicateProbeRowV1[],
            {
                template_id,
                proposed_name: suggestion.draft_row?.name ?? "",
                event_type: suggestion.draft_row?.event_type ?? "",
                entity_type: suggestion.draft_row?.entity_type ?? "",
                scope: parseWorkflowScopeFromMetadata(draftMeta),
                lead_days_before_tour,
                reminder_intent_v1: draftMeta?.workflow_assist?.reminder_intent_v1 ?? null,
            }
        );
        if (duplicate_warning.has_likely_duplicate) {
            suggestion = { ...suggestion, duplicate_warning };
        }
    }

    return NextResponse.json({ ok: true, suggestion });
}

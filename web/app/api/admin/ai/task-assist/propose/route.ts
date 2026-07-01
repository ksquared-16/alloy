import { NextRequest, NextResponse } from "next/server";

import { buildDeterministicTaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/taskAssistDeterministicProposal";
import { assembleTaskAssistOpportunityContextV1 } from "@/lib/agent/taskAssist/taskAssistOpportunityContext";
import { createTaskAssistProposal } from "@/lib/agent/taskAssist/taskAssistProposalPersistence";
import { parseTaskAssistProposeRequest } from "@/lib/agent/taskAssist/taskAssistProposeRouteValidation";
import { validateTaskAssistSuggestionV1ForPropose } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { isAiEnrichmentStubEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import { computeOpenAiLiveInvocationPermitted, resolveAiEnrichmentPortalAccess } from "@/lib/ai/aiEnrichmentPermissions";
import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import {
    evaluateOrgPolicyForOpenAiTaskAssistProposeRoute,
    evaluateOrgPolicyForStubTaskAssistProposeRoute,
} from "@/lib/ai/aiEnrichmentRouteGuards";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST `/api/admin/ai/task-assist/propose` — deterministic Task Assist proposal (V1 Card 2).
 *
 * **Gates:** same portal contract as enrich-attention-suggestion (`resolveAiEnrichmentPortalAccess`);
 * org `metadata.ai_policy` must allow feature **`task_assist_draft`** with provider **stub** or **openai**.
 * Stub path also requires `AI_ENRICHMENT_STUB_ENABLED=true`. OpenAI policy branch does **not** call OpenAI here.
 *
 * **Body:** `{ entity_type: "opportunities", entity_id, channel: "sms"|"email", instruction?: string, goal?: string, persist?: boolean, expires_at?: string|null }`
 *
 * Read-only by default: no DB writes, no send, no workflows. With **`persist: true`** (explicit opt-in), inserts `task_assist_proposals` when the proposal validates (still no send).
 */
export async function POST(request: NextRequest) {
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

    const parsed = parseTaskAssistProposeRequest(body);
    if (!parsed.ok) {
        return NextResponse.json(
            { ok: false, error: parsed.error, message: parsed.message ?? null },
            { status: parsed.status }
        );
    }
    const { entity_id: entityId, channel, instruction, persist, expiresAt, synthesizedDraft } = parsed.value;

    const supabase = createAdminClient();
    const { data: orgSettings, error: orgErr } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (orgErr) {
        console.error("[task-assist/propose] org_settings", orgErr);
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
                        "Task Assist (openai policy branch) requires AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true and permission ai.enrichment.use.",
                },
                { status: 403 }
            );
        }
        const policyGate = evaluateOrgPolicyForOpenAiTaskAssistProposeRoute(org_metadata);
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
                    message: "Set AI_ENRICHMENT_STUB_ENABLED=true to enable Task Assist stub policy routes.",
                },
                { status: 403 }
            );
        }
        const policyGate = evaluateOrgPolicyForStubTaskAssistProposeRoute(org_metadata);
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
                message: "Task Assist requires ai_policy.provider stub or openai with task_assist_draft allowed.",
            },
            { status: 403 }
        );
    }

    const userId = access.userId.trim();
    if (!userId) {
        return NextResponse.json({ ok: false, error: "ACTOR_REQUIRED", message: "Authenticated user id required." }, { status: 401 });
    }

    const assembled = await assembleTaskAssistOpportunityContextV1({
        supabase,
        orgId: ctx.orgId,
        opportunityId: entityId,
    });
    if (!assembled.ok) {
        const status = assembled.status === 404 ? 404 : 500;
        return NextResponse.json(
            { ok: false, error: assembled.error, message: status === 404 ? "Opportunity not found." : "Failed to load opportunity." },
            { status }
        );
    }

    const proposal = buildDeterministicTaskAssistSuggestionV1({
        orgId: ctx.orgId,
        actorUserId: userId,
        channel,
        instruction,
        context: assembled.context,
        synthesizedDraft,
    });

    const validation_codes = validateTaskAssistSuggestionV1ForPropose(proposal);
    const proposalOut = {
        ...proposal,
        validation_errors: [...validation_codes],
    };

    if (persist) {
        if (validation_codes.length > 0) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "PERSIST_REQUIRES_VALID_PROPOSAL",
                    message: "persist: true requires a proposal with no validation errors.",
                    proposal: proposalOut,
                    proposal_validation_codes: validation_codes,
                    proposal_valid: false,
                },
                { status: 422 }
            );
        }
        const persisted = await createTaskAssistProposal({
            supabase,
            orgId: ctx.orgId,
            userId,
            suggestion: proposalOut,
            expiresAt,
        });
        if (!persisted.ok) {
            return NextResponse.json(
                { ok: false, error: persisted.error, message: persisted.message, proposal: proposalOut, proposal_valid: true },
                { status: 400 }
            );
        }
        return NextResponse.json({
            ok: true,
            proposal: proposalOut,
            proposal_validation_codes: validation_codes,
            proposal_valid: true,
            persisted_proposal: persisted.row,
        });
    }

    return NextResponse.json({
        ok: true,
        proposal: proposalOut,
        proposal_validation_codes: validation_codes,
        proposal_valid: validation_codes.length === 0,
    });
}

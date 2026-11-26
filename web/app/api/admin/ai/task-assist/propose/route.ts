import { NextRequest, NextResponse } from "next/server";

import { buildDeterministicTaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/taskAssistDeterministicProposal";
import { assembleTaskAssistOpportunityContextV1 } from "@/lib/agent/taskAssist/taskAssistOpportunityContext";
import { createTaskAssistProposal } from "@/lib/agent/taskAssist/taskAssistProposalPersistence";
import { parseTaskAssistProposeRequest } from "@/lib/agent/taskAssist/taskAssistProposeRouteValidation";
import { validateTaskAssistSuggestionV1ForPropose } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { completeTrustAuthorization, resolveTrustAccessAuthorization } from "@/lib/ai/resolveTrustAuthorization";
import { trustAuthorizationRefusalResponse } from "@/lib/ai/trustAuthorizationHttp";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST `/api/admin/ai/task-assist/propose` — deterministic Task Assist proposal (V1 Card 2).
 *
 * **Gates:** resolved entirely by the canonical Trust authorization seam
 * (`resolveTrustAccessAuthorization` then `completeTrustAuthorization`, consumer `task_assist_propose`).
 * This route branches on no authority of its own. It is the only consumer that requires a resolvable
 * actor, because it persists one. The openai policy branch does **not** call OpenAI here.
 *
 * **Body:** `{ entity_type: "opportunities", entity_id, channel: "sms"|"email", instruction?: string, goal?: string, persist?: boolean, expires_at?: string|null }`
 *
 * Read-only by default: no DB writes, no send, no workflows. With **`persist: true`** (explicit opt-in), inserts `task_assist_proposals` when the proposal validates (still no send).
 */
export async function POST(request: NextRequest) {
    // Stage 1 of the canonical authorization seam: identity, org context, portal.
    const gate = resolveTrustAccessAuthorization({
        consumer: "task_assist_propose",
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

    // Stage 2: organization policy, reasoning mode, provider availability and
    // actor identity. The route branches on nothing itself.
    const authorization = completeTrustAuthorization({
        accessDecision: gate.decision,
        orgMetadata: orgSettings?.metadata ?? {},
    });
    if (!authorization.permitted) return trustAuthorizationRefusalResponse(authorization)!;

    // Guaranteed by `requiresActorUserId` on this consumer's descriptor.
    const userId = authorization.evidence.actor_user_id!;

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

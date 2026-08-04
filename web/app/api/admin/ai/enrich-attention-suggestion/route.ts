import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import { completeTrustAuthorization, resolveTrustAccessAuthorization } from "@/lib/ai/resolveTrustAuthorization";
import { trustAuthorizationRefusalResponse } from "@/lib/ai/trustAuthorizationHttp";
import { enrichAttentionSuggestionStubEnvelope } from "@/lib/ai/enrichAttentionSuggestionStub";
import { enrichAttentionSuggestionViaTrustRuntime } from "@/lib/trust/consumers/attentionSuggestionEnrichmentEnvelope";
import { parseEnrichAttentionSuggestionRequest } from "@/lib/ai/enrichAttentionSuggestionRouteValidation";
import { permitsReasoningMode } from "@/lib/trust/authorization/trustAuthorizationDecision";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST — structured enrichment for an existing deterministic needs-attention suggestion.
 *
 * **Gates:** resolved entirely by the canonical Trust authorization seam
 * (`resolveTrustAccessAuthorization` then `completeTrustAuthorization`, consumer
 * `attention_draft_enrichment`). This route branches on no authority of its own. It is the only
 * consumer that reaches a provider, so it is the only one whose decision carries provider
 * availability. Server-only — no client env.
 *
 * **Body:** `{ correlation_id: string, request_id?: string, deterministic_suggestion: AttentionSuggestionV1 }`
 *
 * Loads `org_settings.metadata` for the current org. Does not persist AI output.
 */
export async function POST(request: NextRequest) {
    // Stage 1 of the canonical authorization seam: identity, org context, portal.
    const gate = resolveTrustAccessAuthorization({
        consumer: "attention_draft_enrichment",
        ctx: await getAdminContextCached(),
        access: await getAdminAccessContextCached(),
    });
    if (!gate.ok) return trustAuthorizationRefusalResponse(gate.decision)!;
    const { ctx, access } = gate;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }
    const parsed = parseEnrichAttentionSuggestionRequest(body);
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
    }
    const { correlation_id: correlationId, request_id: requestIdFromBody, deterministic: det } = parsed;

    const supabase = createAdminClient();
    const { data: orgSettings, error } = await supabase.from("org_settings").select("metadata").eq("org_id", ctx.orgId).maybeSingle();
    if (error) {
        console.error("[enrich-attention-suggestion] org_settings", error);
        return NextResponse.json({ ok: false, error: "ORG_SETTINGS_LOAD_FAILED" }, { status: 500 });
    }

    const org_metadata = orgSettings?.metadata ?? {};
    const policyQuick = parseAiPolicyFromMetadata(org_metadata);

    // Stage 2: organization policy, reasoning mode, provider permission and
    // provider availability. The route branches on nothing itself.
    const authorization = completeTrustAuthorization({ accessDecision: gate.decision, orgMetadata: org_metadata });
    if (!authorization.permitted) return trustAuthorizationRefusalResponse(authorization)!;

    // Trust Runtime V1, Slice 1. The deterministic path is governed: it becomes a
    // Decision Contract and returns a Decision Package, with the same envelope
    // the surface has always rendered. No provider participates.
    //
    // The live-provider branch is deliberately untouched — Slice 1 sends nothing
    // anywhere, and rerouting a provider call is Slice 2's decision to make.
    if (permitsReasoningMode(authorization, "deterministic_local")) {
        let governed;
        try {
            governed = await enrichAttentionSuggestionViaTrustRuntime({
                org_id: ctx.orgId,
                org_metadata,
                deterministic: det,
                correlation_id: correlationId,
                request_id: requestIdFromBody,
                operator_id: ctx.userId ?? null,
                authorization,
            });
        } catch (e) {
            // A Decision Package that cannot be persisted cannot be audited, and
            // an unauditable recommendation must not reach an operator. This is a
            // convenience-tier decision class, so it fails cosmetically: the
            // operator keeps the deterministic suggestion and loses only the
            // wording overlay.
            console.error("[enrich-attention-suggestion] trust runtime unavailable:", e instanceof Error ? e.message : e);
            return NextResponse.json({
                ok: true,
                envelope: {
                    version: 1,
                    deterministic_suggestion: det,
                    enrichment: null,
                    policy_snapshot: {
                        enabled: policyQuick.enabled,
                        provider: policyQuick.provider,
                        pii_mode: policyQuick.pii_mode,
                        allowed_features: policyQuick.allowed_features,
                    },
                },
                telemetry_emitted: false,
                enrichment_telemetry: { provider_key: policyQuick.provider, outcome: "error" },
                provider_error_code: null,
                decision: null,
            });
        }

        return NextResponse.json({
            ok: true,
            envelope: governed.envelope,
            telemetry_emitted: governed.telemetry_emitted,
            enrichment_telemetry: {
                provider_key: governed.telemetry_payload.provider_key,
                outcome: governed.telemetry_payload.outcome,
            },
            provider_error_code: null,
            decision: {
                package_id: governed.decision_package.id,
                contract_id: governed.decision_package.contract_id,
                outcome: governed.decision_package.outcome,
                trust_score: governed.decision_package.trust_score,
                review_requirement: governed.decision_package.review_requirement,
            },
        });
    }

    // Provider-backed path. Permission and availability were both settled by the
    // seam; this reports the already-resolved verdict rather than re-deriving it.
    const result = await enrichAttentionSuggestionStubEnvelope({
        org_id: ctx.orgId,
        org_metadata,
        deterministic: det,
        correlation_id: correlationId,
        request_id: requestIdFromBody,
        openai_live_invocation_permitted: authorization.evidence.provider_use_permitted,
    });

    return NextResponse.json({
        ok: true,
        envelope: result.envelope,
        telemetry_emitted: result.telemetry_emitted,
        enrichment_telemetry: {
            provider_key: result.telemetry_payload.provider_key,
            outcome: result.telemetry_payload.outcome,
        },
        provider_error_code: result.provider_last_error_code ?? null,
    });
}

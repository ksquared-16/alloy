import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { hasOpenAiStructuredCredentials, isAiEnrichmentStubEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import { computeOpenAiLiveInvocationPermitted, resolveAiEnrichmentPortalAccess } from "@/lib/ai/aiEnrichmentPermissions";
import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import {
    evaluateOrgPolicyForOpenAiAttentionDraftEnrichmentRoute,
    evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute,
} from "@/lib/ai/aiEnrichmentRouteGuards";
import { enrichAttentionSuggestionStubEnvelope } from "@/lib/ai/enrichAttentionSuggestionStub";
import { enrichAttentionSuggestionViaTrustRuntime } from "@/lib/trust/consumers/attentionSuggestionEnrichmentEnvelope";
import { parseEnrichAttentionSuggestionRequest } from "@/lib/ai/enrichAttentionSuggestionRouteValidation";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST — structured enrichment for an existing deterministic needs-attention suggestion.
 *
 * **Gates:** portal + org-scoped access (see {@link resolveAiEnrichmentPortalAccess}), org `metadata.ai_policy`
 * (`enabled`, `provider` stub or openai, `draft_enrichment` allowed). Stub path also requires `AI_ENRICHMENT_STUB_ENABLED`.
 * OpenAI-compatible live path requires `AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true`, `ai.enrichment.use` grant,
 * `OPENAI_API_KEY` + `OPENAI_MODEL` (optional `OPENAI_BASE_URL`). Server-only — no client env.
 *
 * **Body:** `{ correlation_id: string, request_id?: string, deterministic_suggestion: AttentionSuggestionV1 }`
 *
 * Loads `org_settings.metadata` for the current org. Does not persist AI output.
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
            { status: portal.status },
        );
    }

    const openaiLiveInvocationPermitted = computeOpenAiLiveInvocationPermitted(access);

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

    if (policyQuick.provider === "openai") {
        if (!openaiLiveInvocationPermitted) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "AI_OPENAI_FORBIDDEN",
                    message:
                        "OpenAI-compatible enrichment requires AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true and permission ai.enrichment.use.",
                },
                { status: 403 },
            );
        }
        if (!hasOpenAiStructuredCredentials()) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "OPENAI_NOT_CONFIGURED",
                    message: "Set OPENAI_API_KEY and OPENAI_MODEL (optional OPENAI_BASE_URL) for live enrichment.",
                },
                { status: 503 },
            );
        }
        const policyGate = evaluateOrgPolicyForOpenAiAttentionDraftEnrichmentRoute(org_metadata);
        if (!policyGate.ok) {
            return NextResponse.json(
                { ok: false, error: policyGate.error, message: policyGate.message },
                { status: 403 },
            );
        }
    } else if (policyQuick.provider === "stub") {
        if (!isAiEnrichmentStubEnvEnabled()) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "FEATURE_DISABLED",
                    message: "Set AI_ENRICHMENT_STUB_ENABLED=true to enable stub enrichment.",
                },
                { status: 403 },
            );
        }
        const policyGate = evaluateOrgPolicyForStubAttentionDraftEnrichmentRoute(org_metadata);
        if (!policyGate.ok) {
            return NextResponse.json(
                { ok: false, error: policyGate.error, message: policyGate.message },
                { status: 403 },
            );
        }
    } else {
        return NextResponse.json(
            {
                ok: false,
                error: "AI_POLICY_PROVIDER",
                message: "This route supports ai_policy.provider stub or openai with draft_enrichment.",
            },
            { status: 403 },
        );
    }

    // Trust Runtime V1, Slice 1. The deterministic path is governed: it becomes a
    // Decision Contract and returns a Decision Package, with the same envelope
    // the surface has always rendered. No provider participates.
    //
    // The live-provider branch is deliberately untouched — Slice 1 sends nothing
    // anywhere, and rerouting a provider call is Slice 2's decision to make.
    if (policyQuick.provider !== "openai") {
        let governed;
        try {
            governed = await enrichAttentionSuggestionViaTrustRuntime({
                org_id: ctx.orgId,
                org_metadata,
                deterministic: det,
                correlation_id: correlationId,
                request_id: requestIdFromBody,
                operator_id: ctx.userId ?? null,
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

    const result = await enrichAttentionSuggestionStubEnvelope({
        org_id: ctx.orgId,
        org_metadata,
        deterministic: det,
        correlation_id: correlationId,
        request_id: requestIdFromBody,
        openai_live_invocation_permitted: openaiLiveInvocationPermitted,
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

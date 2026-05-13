import { NextRequest, NextResponse } from "next/server";

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { NEEDS_ATTENTION_SUGGESTION_AGENT_KEY } from "@/lib/agent/needsAttentionSuggestion/types";
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
import { createAdminClient } from "@/lib/supabaseAdmin";

function parseAttentionSuggestionBody(raw: unknown): AttentionSuggestionV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    if (o.agent_key !== NEEDS_ATTENTION_SUGGESTION_AGENT_KEY) return null;
    const target = o.target;
    if (target == null || typeof target !== "object" || Array.isArray(target)) return null;
    const t = target as Record<string, unknown>;
    if (t.entity_type !== "opportunities") return null;
    if (typeof t.entity_id !== "string" || !t.entity_id.trim()) return null;
    return raw as AttentionSuggestionV1;
}

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
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ ok: false, error: "BAD_BODY" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const correlationId = typeof b.correlation_id === "string" && b.correlation_id.trim() ? b.correlation_id.trim() : null;
    if (!correlationId) {
        return NextResponse.json({ ok: false, error: "MISSING_CORRELATION_ID" }, { status: 400 });
    }

    const det = parseAttentionSuggestionBody(b.deterministic_suggestion);
    if (!det) {
        return NextResponse.json({ ok: false, error: "INVALID_SUGGESTION" }, { status: 400 });
    }

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

    const requestId = typeof b.request_id === "string" && b.request_id.trim() ? b.request_id.trim() : undefined;

    const result = await enrichAttentionSuggestionStubEnvelope({
        org_id: ctx.orgId,
        org_metadata,
        deterministic: det,
        correlation_id: correlationId,
        request_id: requestId,
        openai_live_invocation_permitted: openaiLiveInvocationPermitted,
    });

    return NextResponse.json({
        ok: true,
        envelope: result.envelope,
        telemetry_emitted: result.telemetry_emitted,
    });
}

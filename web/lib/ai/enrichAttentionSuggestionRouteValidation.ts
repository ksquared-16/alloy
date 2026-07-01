/**
 * Request parsing for `POST /api/admin/ai/enrich-attention-suggestion` (no I/O).
 * Keeps validation testable without spinning the full route graph.
 */

import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { NEEDS_ATTENTION_SUGGESTION_AGENT_KEY } from "@/lib/agent/needsAttentionSuggestion/types";

export function parseDeterministicAttentionSuggestionForEnrichRoute(raw: unknown): AttentionSuggestionV1 | null {
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

export type ParsedEnrichAttentionRequest =
    | { ok: true; correlation_id: string; request_id?: string; deterministic: AttentionSuggestionV1 }
    | { ok: false; error: string; status: number };

/**
 * Validates JSON body shape for enrich-attention-suggestion (after `request.json()`).
 */
export function parseEnrichAttentionSuggestionRequest(body: unknown): ParsedEnrichAttentionRequest {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
        return { ok: false, error: "BAD_BODY", status: 400 };
    }
    const b = body as Record<string, unknown>;
    const correlationId = typeof b.correlation_id === "string" && b.correlation_id.trim() ? b.correlation_id.trim() : null;
    if (!correlationId) {
        return { ok: false, error: "MISSING_CORRELATION_ID", status: 400 };
    }
    const deterministic = parseDeterministicAttentionSuggestionForEnrichRoute(b.deterministic_suggestion);
    if (!deterministic) {
        return { ok: false, error: "INVALID_SUGGESTION", status: 400 };
    }
    const requestId = typeof b.request_id === "string" && b.request_id.trim() ? b.request_id.trim() : undefined;
    return { ok: true, correlation_id: correlationId, request_id: requestId, deterministic };
}

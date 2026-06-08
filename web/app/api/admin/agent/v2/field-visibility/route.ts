import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { agentV2CommitFieldVisibilityApply } from "@/lib/agent/v2/agentV2FieldVisibilityAtomicCommit";
import {
    lockTimestampMatches,
    prepareFieldDefinitionVisibilityPatch,
} from "@/lib/agent/v2/applyFieldDefinitionVisibility";
import { getFieldDefinitionLockTimestamp } from "@/lib/agent/v2/fieldVisibilityConfigV0";

function agentV2FieldVisibilityEnabled(): boolean {
    const v = process.env.AGENT_V2_FIELD_VISIBILITY_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

type AgentV2FvErrorCode =
    | "PARSE_FAILED"
    | "SCOPE_DENIED"
    | "STALE_VERSION"
    | "VALIDATION_FAILED"
    | "POLICY_DENIED"
    | "APPLY_FAILED"
    | "FEATURE_DISABLED";

type Slots = {
    target_kind: "field_definition_visibility";
    field_definition_id: string;
    expected_updated_at: string;
    visibility_patch: unknown;
};

type StructuredOverride = {
    intent_id: string;
    intent_version: number;
    intent_type: "update_field_visibility";
    slots: Slots;
};

function isStructuredOverride(x: unknown): x is StructuredOverride {
    if (x == null || typeof x !== "object" || Array.isArray(x)) return false;
    const o = x as Record<string, unknown>;
    if (typeof o.intent_id !== "string" || typeof o.intent_version !== "number") return false;
    if (o.intent_type !== "update_field_visibility") return false;
    const slots = o.slots;
    if (slots == null || typeof slots !== "object" || Array.isArray(slots)) return false;
    const s = slots as Record<string, unknown>;
    if (s.target_kind !== "field_definition_visibility") return false;
    if (typeof s.field_definition_id !== "string" || !s.field_definition_id.trim()) return false;
    if (typeof s.expected_updated_at !== "string" || !s.expected_updated_at.trim()) return false;
    if (!("visibility_patch" in s)) return false;
    return true;
}

function isUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

/**
 * POST — AI agent v2: `update_field_visibility` via structured_override only (no LLM).
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return jsonErr(403, "POLICY_DENIED", "Forbidden");
    }
    if (!agentV2FieldVisibilityEnabled()) {
        return jsonErr(403, "FEATURE_DISABLED", "Agent v2 field visibility is disabled");
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return jsonErr(400, "PARSE_FAILED", "Invalid JSON");
    }

    const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
    const correlationId = typeof body.correlation_id === "string" ? body.correlation_id.trim() : "";
    if (!requestId || !correlationId) {
        return jsonErr(400, "VALIDATION_FAILED", "request_id and correlation_id are required", {
            correlation_id: correlationId || undefined,
            request_id: requestId || undefined,
        });
    }

    if (typeof body.org_id === "string" && body.org_id.trim() && body.org_id.trim() !== ctx.orgId) {
        return jsonErr(403, "SCOPE_DENIED", "org_id does not match session", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
        return jsonErr(400, "VALIDATION_FAILED", "message is required", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    const override = body.structured_override;
    if (override === undefined || override === null) {
        return jsonErr(400, "PARSE_FAILED", "structured_override is required (LLM not enabled)", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    if (!isStructuredOverride(override)) {
        return jsonErr(400, "VALIDATION_FAILED", "structured_override has invalid shape", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    if (override.intent_version !== 1) {
        return jsonErr(400, "VALIDATION_FAILED", "intent_version must be 1", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    if (!isUuid(requestId) || !isUuid(correlationId)) {
        return jsonErr(400, "VALIDATION_FAILED", "request_id and correlation_id must be UUIDs", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    const slots = override.slots;
    const proposalId = randomUUID();
    const planId = randomUUID();
    const resultId = randomUUID();

    const supabase = createAdminClient();

    const { data: fdRow, error: fdErr } = await supabase
        .from("field_definitions")
        .select("*")
        .eq("id", slots.field_definition_id.trim())
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fdErr) {
        return jsonErr(500, "APPLY_FAILED", fdErr.message, {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }
    if (!fdRow) {
        return jsonErr(404, "SCOPE_DENIED", "Field definition not found", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    const r = fdRow as Record<string, unknown>;
    if (getFieldDefinitionLockTimestamp(r) == null) {
        return jsonErr(400, "VALIDATION_FAILED", "Field definition has no lock timestamp", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    if (!lockTimestampMatches(r, slots.expected_updated_at)) {
        return NextResponse.json(
            {
                ok: false,
                correlation_id: correlationId,
                request_id: requestId,
                error: {
                    error_code: "STALE_VERSION" as const,
                    message: "field_definitions row was modified (stale expected_updated_at)",
                },
            },
            { status: 409 }
        );
    }

    const prep = prepareFieldDefinitionVisibilityPatch(r, slots.visibility_patch);
    if (!prep.ok) {
        return NextResponse.json(
            {
                ok: false,
                correlation_id: correlationId,
                request_id: requestId,
                error: { error_code: "VALIDATION_FAILED" as const, message: prep.error },
            },
            { status: prep.status }
        );
    }

    const intentPayload = {
        intent_id: override.intent_id,
        intent_version: override.intent_version,
        intent_type: override.intent_type,
        slots,
    };

    const atomic = await agentV2CommitFieldVisibilityApply(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        fieldDefinitionId: slots.field_definition_id.trim(),
        expectedUpdatedAt: slots.expected_updated_at.trim(),
        mergedVisibility: prep.mergedFlags,
        proposalId,
        requestId,
        correlationId,
        intentJson: intentPayload,
        resultId,
    });

    if (!atomic.ok) {
        const code: AgentV2FvErrorCode =
            atomic.code === "STALE_VERSION"
                ? "STALE_VERSION"
                : atomic.code === "NOT_FOUND"
                  ? "SCOPE_DENIED"
                  : "APPLY_FAILED";
        return NextResponse.json(
            {
                ok: false,
                correlation_id: correlationId,
                request_id: requestId,
                error: { error_code: code, message: atomic.error },
            },
            { status: atomic.status }
        );
    }

    const row = atomic.fieldRow;
    const executionResult = {
        result_id: resultId,
        plan_id: planId,
        proposal_id: proposalId,
        terminal_status: "success" as const,
        per_step: [
            {
                step_index: 0,
                http_status_or_internal: 200,
                field_definition_id: row.id,
                applied_updated_at: row.updated_at,
            },
        ],
        applied_snapshot: row,
    };

    return NextResponse.json({
        ok: true,
        correlation_id: correlationId,
        request_id: requestId,
        execution: executionResult,
    });
}

function jsonErr(
    status: number,
    code: AgentV2FvErrorCode,
    message: string,
    extra?: { correlation_id?: string; request_id?: string }
) {
    return NextResponse.json(
        {
            ok: false,
            correlation_id: extra?.correlation_id ?? "",
            request_id: extra?.request_id ?? "",
            error: { error_code: code, message },
        },
        { status }
    );
}

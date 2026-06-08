import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { agentV1CommitRecordOverviewLayoutApply } from "@/lib/agent/v1/agentV1RecordOverviewLayoutAtomicCommit";
import { prepareRecordOverviewLayoutPut } from "@/lib/agent/v1/applyRecordOverviewLayoutUpdate";
import { getOverviewLayoutConfigStoredVersion } from "@/lib/rrs/overview/overviewLayoutConfigStrict";
import {
    RECORD_OVERVIEW_LAYOUT_V1_ENTITY_DB,
    RECORD_OVERVIEW_LAYOUT_V1_SURFACE,
} from "@/lib/rrs/overview/recordOverviewLayoutScope";

function agentV1RecordLayoutEnabled(): boolean {
    const v = process.env.AGENT_V1_RECORD_LAYOUT_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

type AgentV1RlErrorCode =
    | "PARSE_FAILED"
    | "SCOPE_DENIED"
    | "STALE_VERSION"
    | "VALIDATION_FAILED"
    | "POLICY_DENIED"
    | "APPLY_FAILED"
    | "FEATURE_DISABLED";

type AgentV1RlSlots = {
    target_kind: "record_overview_layout";
    entity_type: "job";
    surface: "overview";
    config: unknown;
    expected_config_version: number;
};

type StructuredOverride = {
    intent_id: string;
    intent_version: number;
    intent_type: "update_record_layout";
    slots: AgentV1RlSlots;
};

function isStructuredOverride(x: unknown): x is StructuredOverride {
    if (x == null || typeof x !== "object" || Array.isArray(x)) return false;
    const o = x as Record<string, unknown>;
    if (typeof o.intent_id !== "string" || typeof o.intent_version !== "number") return false;
    if (o.intent_type !== "update_record_layout") return false;
    const slots = o.slots;
    if (slots == null || typeof slots !== "object" || Array.isArray(slots)) return false;
    const s = slots as Record<string, unknown>;
    if (s.target_kind !== "record_overview_layout") return false;
    if (s.entity_type !== "job") return false;
    if (s.surface !== "overview") return false;
    if (typeof s.expected_config_version !== "number" || !Number.isInteger(s.expected_config_version)) {
        return false;
    }
    if (!("config" in s)) return false;
    return true;
}

/**
 * POST — AI agent v1: `update_record_layout` via structured_override only (no LLM).
 * Config + audit rows commit atomically (Postgres RPC).
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return jsonErr(403, "POLICY_DENIED", "Forbidden");
    }
    if (!agentV1RecordLayoutEnabled()) {
        return jsonErr(403, "FEATURE_DISABLED", "Agent v1 record layout is disabled");
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

    const slots = override.slots;
    const proposalId = randomUUID();
    const planId = randomUUID();
    const resultId = randomUUID();

    const supabase = createAdminClient();

    const { data: layoutRow, error: layoutErr } = await supabase
        .from("record_overview_layouts")
        .select("id, org_id, entity_type, surface, config, updated_at")
        .eq("org_id", ctx.orgId)
        .eq("entity_type", RECORD_OVERVIEW_LAYOUT_V1_ENTITY_DB)
        .eq("surface", RECORD_OVERVIEW_LAYOUT_V1_SURFACE)
        .maybeSingle();

    if (layoutErr) {
        return jsonErr(500, "APPLY_FAILED", layoutErr.message, {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    const currentRaw = layoutRow?.config ?? {};
    const prep = prepareRecordOverviewLayoutPut(currentRaw, slots.config, slots.expected_config_version);

    if (!prep.ok) {
        const code: AgentV1RlErrorCode = prep.code === "STALE_VERSION" ? "STALE_VERSION" : "VALIDATION_FAILED";
        return NextResponse.json(
            {
                ok: false,
                correlation_id: correlationId,
                request_id: requestId,
                error: { error_code: code, message: prep.error },
            },
            { status: prep.status }
        );
    }

    const intentPayload = {
        intent_id: override.intent_id,
        intent_version: override.intent_version,
        intent_type: override.intent_type,
        slots,
        /** Human command / context for audit & AI Activity (same JSON blob as structured intent). */
        message: message.trim(),
    };

    if (!isUuid(requestId) || !isUuid(correlationId)) {
        return jsonErr(400, "VALIDATION_FAILED", "request_id and correlation_id must be UUIDs", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    const atomic = await agentV1CommitRecordOverviewLayoutApply(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        entityTypeDb: RECORD_OVERVIEW_LAYOUT_V1_ENTITY_DB,
        surface: RECORD_OVERVIEW_LAYOUT_V1_SURFACE,
        expectedVersion: slots.expected_config_version,
        config: prep.nextConfig,
        proposalId,
        requestId,
        correlationId,
        intentJson: intentPayload,
        resultId,
    });

    if (!atomic.ok) {
        const code: AgentV1RlErrorCode =
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

    const row = atomic.layoutRow;
    const cfg = row.config;
    const appliedVersion = getOverviewLayoutConfigStoredVersion(cfg);

    const executionResult = {
        result_id: resultId,
        plan_id: planId,
        proposal_id: proposalId,
        terminal_status: "success" as const,
        per_step: [
            {
                step_index: 0,
                http_status_or_internal: 200,
                record_overview_layout_id: row.id,
                applied_config_version: appliedVersion,
            },
        ],
        applied_snapshot: {
            id: row.id,
            config: cfg,
            updated_at: row.updated_at,
        },
    };

    return NextResponse.json({
        ok: true,
        correlation_id: correlationId,
        request_id: requestId,
        execution: executionResult,
    });
}

function isUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

function jsonErr(
    status: number,
    code: AgentV1RlErrorCode,
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

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { agentV0CommitQueueDefinitionApply } from "@/lib/agent/v0/agentV0AtomicCommit";
import { prepareQueueDefinitionPatch } from "@/lib/agent/v0/applyWorkUnitQueueDefinitionUpdate";
import { getQueueDefinitionStoredVersion } from "@/lib/rrs/queue/queueDefinitionV1";

function agentV0Enabled(): boolean {
    const v = process.env.AGENT_V0_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

type AgentV0ErrorCode =
    | "PARSE_FAILED"
    | "SCOPE_DENIED"
    | "STALE_VERSION"
    | "VALIDATION_FAILED"
    | "POLICY_DENIED"
    | "APPLY_FAILED"
    | "FEATURE_DISABLED";

type AgentV0Slots = {
    work_unit_id: string;
    queue_definition: unknown;
    expected_queue_definition_version: number;
};

type StructuredOverride = {
    intent_id: string;
    intent_version: number;
    intent_type: "update_queue_definition";
    slots: AgentV0Slots;
};

function isStructuredOverride(x: unknown): x is StructuredOverride {
    if (x == null || typeof x !== "object" || Array.isArray(x)) return false;
    const o = x as Record<string, unknown>;
    if (typeof o.intent_id !== "string" || typeof o.intent_version !== "number") return false;
    if (o.intent_type !== "update_queue_definition") return false;
    const slots = o.slots;
    if (slots == null || typeof slots !== "object" || Array.isArray(slots)) return false;
    const s = slots as Record<string, unknown>;
    if (typeof s.work_unit_id !== "string") return false;
    if (typeof s.expected_queue_definition_version !== "number" || !Number.isInteger(s.expected_queue_definition_version)) {
        return false;
    }
    if (!("queue_definition" in s)) return false;
    return true;
}

/**
 * POST — AI agent v0: `update_queue_definition` via structured_override only (no LLM).
 * Config + audit rows commit atomically (Postgres RPC).
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return jsonErr(403, "POLICY_DENIED", "Forbidden");
    }
    if (!agentV0Enabled()) {
        return jsonErr(403, "FEATURE_DISABLED", "Agent v0 is disabled");
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
    const workUnitId = slots.work_unit_id;
    const proposalId = randomUUID();
    const planId = randomUUID();
    const resultId = randomUUID();

    const supabase = createAdminClient();

    const { data: wu, error: wuErr } = await supabase
        .from("work_units")
        .select("id, org_id, queue_definition, updated_at")
        .eq("id", workUnitId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (wuErr) {
        return jsonErr(500, "APPLY_FAILED", wuErr.message, {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }
    if (!wu) {
        return jsonErr(404, "SCOPE_DENIED", "Work unit not found", {
            correlation_id: correlationId,
            request_id: requestId,
        });
    }

    const prep = prepareQueueDefinitionPatch(
        wu.queue_definition,
        slots.queue_definition === undefined ? null : slots.queue_definition,
        slots.expected_queue_definition_version
    );

    if (!prep.ok) {
        const code: AgentV0ErrorCode = prep.code === "STALE_VERSION" ? "STALE_VERSION" : "VALIDATION_FAILED";
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
    };

    const atomic = await agentV0CommitQueueDefinitionApply(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        workUnitId,
        expectedVersion: slots.expected_queue_definition_version,
        queueDefinition: prep.nextQueueDefinition,
        proposalId,
        requestId,
        correlationId,
        intentJson: intentPayload,
        resultId,
    });

    if (!atomic.ok) {
        const code: AgentV0ErrorCode =
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

    const row = atomic.workUnitRow;
    const qd = row.queue_definition;
    const appliedVersion = getQueueDefinitionStoredVersion(qd);

    const executionResult = {
        result_id: resultId,
        plan_id: planId,
        proposal_id: proposalId,
        terminal_status: "success" as const,
        per_step: [
            {
                step_index: 0,
                http_status_or_internal: 200,
                work_unit_id: workUnitId,
                applied_queue_definition_version: appliedVersion,
            },
        ],
        applied_snapshot: {
            id: row.id,
            queue_definition: qd,
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

function jsonErr(
    status: number,
    code: AgentV0ErrorCode,
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

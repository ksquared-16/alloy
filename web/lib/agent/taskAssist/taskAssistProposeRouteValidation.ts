import {
    isTaskAssistV1Uuid,
    validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys,
} from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";

const ALLOWED_BODY_KEYS = new Set(["entity_type", "entity_id", "channel", "instruction", "goal"]);

const MAX_INSTRUCTION_LEN = 8000;

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export type ParsedTaskAssistProposeRequestV1 = {
    entity_type: "opportunities";
    entity_id: string;
    channel: "sms" | "email";
    instruction: string;
};

export function parseTaskAssistProposeRequest(
    body: unknown
): { ok: true; value: ParsedTaskAssistProposeRequestV1 } | { ok: false; error: string; status: number; message?: string } {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON_SHAPE", status: 400, message: "Body must be a JSON object." };
    }

    const workflowErrs = validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys(body);
    if (workflowErrs.length) {
        return {
            ok: false,
            error: "WORKFLOW_KEYS_FORBIDDEN",
            status: 400,
            message: workflowErrs[0],
        };
    }

    for (const k of Object.keys(body)) {
        if (!ALLOWED_BODY_KEYS.has(k)) {
            return {
                ok: false,
                error: "UNKNOWN_BODY_KEYS",
                status: 400,
                message: `Unexpected key: ${k}`,
            };
        }
    }

    const entityType = typeof body.entity_type === "string" ? body.entity_type.trim().toLowerCase() : "";
    if (entityType !== "opportunities") {
        return {
            ok: false,
            error: "ENTITY_TYPE_UNSUPPORTED",
            status: 400,
            message: "entity_type must be opportunities.",
        };
    }

    const entityId = typeof body.entity_id === "string" ? body.entity_id.trim() : "";
    if (!entityId || !isTaskAssistV1Uuid(entityId)) {
        return { ok: false, error: "ENTITY_ID_INVALID", status: 400, message: "entity_id must be a UUID." };
    }

    const channelRaw = typeof body.channel === "string" ? body.channel.trim().toLowerCase() : "";
    if (channelRaw !== "sms" && channelRaw !== "email") {
        return { ok: false, error: "CHANNEL_UNSUPPORTED", status: 400, message: "channel must be sms or email." };
    }

    const insRaw =
        typeof body.instruction === "string" && body.instruction.trim()
            ? body.instruction.trim()
            : typeof body.goal === "string" && body.goal.trim()
              ? body.goal.trim()
              : "";
    if (!insRaw) {
        return {
            ok: false,
            error: "INSTRUCTION_REQUIRED",
            status: 400,
            message: "instruction (or goal) is required and must be non-empty.",
        };
    }
    const instruction = insRaw.length > MAX_INSTRUCTION_LEN ? insRaw.slice(0, MAX_INSTRUCTION_LEN) : insRaw;

    return {
        ok: true,
        value: {
            entity_type: "opportunities",
            entity_id: entityId,
            channel: channelRaw,
            instruction,
        },
    };
}

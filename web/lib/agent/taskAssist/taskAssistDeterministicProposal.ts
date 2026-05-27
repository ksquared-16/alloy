import { createHash } from "node:crypto";

import { formatTaskAssistDraftOpening } from "@/lib/agent/taskAssist/taskAssistDraftMessageNormalize";
import type { TaskAssistOpportunityContextV1 } from "@/lib/agent/taskAssist/taskAssistOpportunityContext";
import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";
import type { TaskAssistV1SendChannel } from "@/lib/agent/taskAssist/types";

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + "…";
}

function suggestionIdParts(params: {
    orgId: string;
    opportunityId: string;
    channel: TaskAssistV1SendChannel;
    instruction: string;
    generatedAtIso: string;
}): string {
    const bucket = params.generatedAtIso.slice(0, 16);
    const ins = truncate(params.instruction, 400);
    return `${params.orgId}|${params.opportunityId}|${params.channel}|${ins}|${bucket}`;
}

export function buildDeterministicTaskAssistSuggestionV1(params: {
    orgId: string;
    actorUserId: string;
    channel: TaskAssistV1SendChannel;
    instruction: string;
    context: TaskAssistOpportunityContextV1;
    /** When set, use BOS communication synthesis instead of instruction-as-body. */
    synthesizedDraft?: {
        subject: string | null;
        body: string;
        sms_body?: string | null;
    } | null;
}): TaskAssistSuggestionV1 {
    const generated_at_iso = new Date().toISOString();
    const suggestion_id = createHash("sha256")
        .update(
            suggestionIdParts({
                orgId: params.orgId,
                opportunityId: params.context.opportunity_id,
                channel: params.channel,
                instruction: params.instruction,
                generatedAtIso: generated_at_iso,
            })
        )
        .digest("hex")
        .slice(0, 48);

    const statusLine = params.context.status_label ?? params.context.status_key ?? "unknown status";
    const context_summary = truncate(`${params.context.opportunity_label} · ${statusLine}`, 240);

    const synthesizedEmailBody = params.synthesizedDraft?.body?.trim() ?? "";
    const synthesizedSmsBody =
        params.synthesizedDraft?.sms_body?.trim() || synthesizedEmailBody;

    const draftOpening = params.synthesizedDraft
        ? params.channel === "sms"
            ? synthesizedSmsBody
            : synthesizedEmailBody
        : formatTaskAssistDraftOpening({
              instruction: params.instruction,
              channel: params.channel,
              context: params.context,
          });

    const draft_body = draftOpening.slice(0, 8000);
    const draft_body_sms = params.synthesizedDraft ? synthesizedSmsBody.slice(0, 8000) : null;
    const draft_body_email = params.synthesizedDraft ? synthesizedEmailBody.slice(0, 8000) : null;

    const draft_subject =
        params.channel === "email"
            ? params.synthesizedDraft?.subject?.trim()
                ? truncate(params.synthesizedDraft.subject.trim(), 200)
                : truncate(`Follow-up: ${params.context.opportunity_label}`, 200)
            : null;

    const warnings: string[] = [];
    if (params.context.recipient_candidates.length > 1) {
        warnings.push("Multiple recipients available — pick one before sending.");
    }

    const missing_inputs: string[] = ["Select a recipient before send (required for apply)."];

    return {
        version: 1,
        agent_key: TASK_ASSIST_AGENT_KEY,
        suggestion_id,
        generated_at_iso,
        org_id: params.orgId,
        actor_user_id: params.actorUserId,
        source_surface: "task_assist_propose_v1",
        task_type: params.channel === "sms" ? "draft_sms" : "draft_email",
        entity_type: "opportunities",
        entity_id: params.context.opportunity_id,
        context_summary,
        recipient_candidates: params.context.recipient_candidates,
        selected_recipient: null,
        channel: params.channel,
        draft_subject,
        draft_body,
        draft_body_sms,
        draft_body_email,
        scheduled_for_iso: null,
        reminder_due_at_iso: null,
        assumptions: [
            params.synthesizedDraft
                ? "Communication draft synthesized from operational objective (deterministic)."
                : "Deterministic template draft (V1) — not from a live model.",
            "Recipient SMS/email presence is based on person row hints; send route re-validates.",
        ],
        missing_inputs,
        warnings,
        validation_errors: [],
        confidence: { mode: "deterministic" },
        approval_required: true,
        apply_intent: { kind: "none" },
    };
}

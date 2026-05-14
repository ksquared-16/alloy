import { createHash } from "node:crypto";

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

    const bodyLines: string[] = [];
    bodyLines.push(truncate(params.instruction, 4000));
    bodyLines.push("");
    bodyLines.push(`— Opportunity: ${params.context.opportunity_label} (${statusLine}).`);
    if (params.context.household_label) {
        bodyLines.push(`— Household: ${params.context.household_label}.`);
    }
    if (params.context.activity_summary) {
        bodyLines.push(`— Recent activity: ${truncate(params.context.activity_summary, 400)}.`);
    }
    if (params.context.children_summary) {
        bodyLines.push(`— ${params.context.children_summary}`);
    }
    if (params.channel === "sms") {
        bodyLines.push("");
        bodyLines.push("Thanks — reply when you can.");
    } else {
        bodyLines.push("");
        bodyLines.push("Thank you for your time.");
    }

    const draft_body = bodyLines.join("\n").slice(0, 8000);

    const draft_subject =
        params.channel === "email" ? truncate(`Follow-up: ${params.context.opportunity_label}`, 200) : null;

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
        scheduled_for_iso: null,
        reminder_due_at_iso: null,
        assumptions: [
            "Deterministic template draft (V1) — not from a live model.",
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

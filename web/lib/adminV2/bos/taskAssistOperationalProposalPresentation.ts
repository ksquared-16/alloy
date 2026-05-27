/**
 * Task Assist → Operational Proposal frame copy (BOS UX coherence Cards 8–9).
 */

import type { TaskAssistCommandBootstrap } from "@/lib/agent/taskAssist/taskAssistCommandIntent";
import {
    communicationObjectiveLabel,
    OPERATIONAL_COMMUNICATION_OBJECTIVES,
    type OperationalCommunicationObjective,
} from "@/lib/adminV2/bos/communication/communicationObjectives";
import {
    MUTATION_BOUNDARY_TASK_ASSIST_REMINDER,
    MUTATION_BOUNDARY_TASK_ASSIST_SCHEDULE,
    MUTATION_BOUNDARY_TASK_ASSIST_SEND,
} from "@/lib/adminV2/bos/bosMutationBoundaryCopy";

export function taskAssistDraftProposalTitle(bootstrap: TaskAssistCommandBootstrap): string {
    if (bootstrap.synthesized_draft) return "Suggested message";
    if (bootstrap.intent_type === "schedule_message") return "Schedule outbound message";
    return "Send outbound message";
}

export function taskAssistDraftProposalTypeLabel(bootstrap: TaskAssistCommandBootstrap): string {
    if (bootstrap.synthesized_draft) return "Review before send";
    if (bootstrap.intent_type === "schedule_message") return "Scheduled message";
    return "Message draft";
}

function instructionSummaryLabel(instruction: string): string | null {
    const raw = instruction.trim();
    if (!raw) return null;
    const prefix = "communication_objective:";
    if (raw.startsWith(prefix)) {
        const key = raw.slice(prefix.length).trim();
        if ((OPERATIONAL_COMMUNICATION_OBJECTIVES as readonly string[]).includes(key)) {
            return communicationObjectiveLabel(key as OperationalCommunicationObjective);
        }
    }
    return raw;
}

export function taskAssistDraftProposalSummary(
    channel: "sms" | "email",
    instruction: string,
    bootstrap?: TaskAssistCommandBootstrap
): string {
    const ch = channel === "email" ? "Email" : "SMS";
    if (bootstrap?.communication_objective) {
        return `${ch} · ${communicationObjectiveLabel(bootstrap.communication_objective)}`;
    }
    if (bootstrap?.synthesized_draft) {
        return `${ch} · Review before send`;
    }
    const fromInstruction = instructionSummaryLabel(instruction);
    if (fromInstruction) return `${ch} · ${fromInstruction}`;
    if (bootstrap?.operator_guidance?.trim()) {
        return `${ch} · ${bootstrap.operator_guidance.trim()}`;
    }
    return ch;
}

export function taskAssistDraftRecipientContextLabel(entityLabel: string): string | null {
    const label = entityLabel.trim();
    if (!label) return null;
    return `Drafted for ${label}`;
}

export function taskAssistDraftMutationBoundaryCopy(bootstrap: TaskAssistCommandBootstrap): string {
    if (bootstrap.intent_type === "schedule_message") {
        return MUTATION_BOUNDARY_TASK_ASSIST_SCHEDULE;
    }
    return MUTATION_BOUNDARY_TASK_ASSIST_SEND;
}

export function taskAssistReminderMutationBoundaryCopy(): string {
    return MUTATION_BOUNDARY_TASK_ASSIST_REMINDER;
}

export function taskAssistReminderProposalTitle(bootstrap: TaskAssistCommandBootstrap): string {
    return bootstrap.reminder_title?.trim() || "Follow up";
}

export const TASK_ASSIST_REMINDER_PROPOSAL_TYPE_LABEL = "Reminder proposal";

export const TASK_ASSIST_PROPOSAL_SOURCE_LABEL = "Suggested message";

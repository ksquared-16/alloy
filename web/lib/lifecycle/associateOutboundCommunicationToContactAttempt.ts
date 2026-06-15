/**
 * After outbound email/SMS, associate communication to open contact attempt work
 * and complete with the appropriate stage outcome when configured.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listWorkForEntity } from "@/lib/admin/operationalWork/operationalWorkService";
import { parseOperationalWorkViewFromTaskRow } from "@/lib/admin/operationalWork/operationalWorkMetadata";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";

const CONTACT_STAGE_KEYS = new Set(["lead", "contacting"]);
const CONTACT_WORK_DEFINITIONS = new Set(["contact_family"]);

export type AssociateCommunicationToContactAttemptInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    opportunityId: string;
    channel: "email" | "sms";
    communicationMessageId?: string | null;
};

export type AssociateCommunicationToContactAttemptResult = {
    associated: boolean;
    task_id?: string;
    outcome_key?: string;
    error?: string;
};

function outcomeKeyForChannel(_channel: "email" | "sms"): string {
    return "sent_text";
}

export async function associateOutboundCommunicationToContactAttempt(
    input: AssociateCommunicationToContactAttemptInput,
): Promise<AssociateCommunicationToContactAttemptResult> {
    const opportunityId = input.opportunityId.trim();
    if (!opportunityId) return { associated: false };

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: input.supabase,
        orgId: input.orgId,
        opportunityId,
    });
    if (!departmentId) return { associated: false };

    const listed = await listWorkForEntity({
        supabase: input.supabase,
        orgId: input.orgId,
        entityType: "opportunities",
        entityId: opportunityId,
    });
    if (!listed.ok) return { associated: false, error: listed.message };

    const openContactTasks = listed.rows.filter((row) => {
        if (row.status !== "open") return false;
        const work = parseOperationalWorkViewFromTaskRow(row);
        const stageKey = work.context_snapshot?.lifecycle_stage_key?.trim() ?? "";
        const defKey = work.work_definition_key?.trim() ?? "";
        const isContactStage = CONTACT_STAGE_KEYS.has(stageKey);
        const isContactWork = defKey ? CONTACT_WORK_DEFINITIONS.has(defKey) : false;
        return isContactStage || isContactWork;
    });

    const task = openContactTasks[0];
    if (!task) return { associated: false };

    const work = parseOperationalWorkViewFromTaskRow(task);
    const stageKey =
        work.context_snapshot?.lifecycle_stage_key?.trim() || "contacting";
    const outcomeKey = outcomeKeyForChannel(input.channel);

    const result = await completeStageWorkWithOutcome({
        supabase: input.supabase,
        orgId: input.orgId,
        userId: input.userId,
        departmentId,
        stageKey,
        workId: task.id,
        outcomeKey,
        subject: {
            journey_segment: "family",
            opportunity_id: opportunityId,
        },
    });

    if (!result.ok) {
        return { associated: false, task_id: task.id, error: result.error };
    }

    if (input.communicationMessageId?.trim()) {
        const md = { ...(task.metadata ?? {}) };
        const links = Array.isArray(md.associated_communication_message_ids)
            ? [...(md.associated_communication_message_ids as string[])]
            : [];
        if (!links.includes(input.communicationMessageId)) {
            links.push(input.communicationMessageId);
        }
        md.associated_communication_message_ids = links;
        await input.supabase
            .from("operational_tasks")
            .update({ metadata: md })
            .eq("org_id", input.orgId)
            .eq("id", task.id);
    }

    return { associated: true, task_id: task.id, outcome_key: outcomeKey };
}

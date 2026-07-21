/**
 * Record a communication-context trace when a follow-up work outcome is applied.
 * Uses workflow_events + opportunity metadata — no parallel completion runtime.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPlatformWorkDefinition } from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
import { emitEvent } from "@/lib/emitEvent";
import { resolveEffectiveWorkDefinitionKeyFromTemplate } from "@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export function workOutcomeRequiresCommunicationTrace(args: {
    plan: StageOperatingPlanV1;
    workTemplateKey: string;
    outcomeKey: string;
    departmentMetadata?: Record<string, unknown> | null;
}): boolean {
    const outcome = args.plan.outcomes.find((row) => row.outcome_key === args.outcomeKey.trim());
    if (!outcome || outcome.successful === true) return false;

    const template = args.plan.work_templates.find(
        (row) => row.template_key === args.workTemplateKey.trim(),
    );
    if (!template) return false;

    const resolved = resolveEffectiveWorkDefinitionKeyFromTemplate(template, {
        departmentMetadata: args.departmentMetadata ?? null,
        stageKey: args.plan.stage_key,
    });
    if (!resolved.ok) return false;

    const definition = getPlatformWorkDefinition(resolved.work_definition_key);
    return definition?.category === "follow_up";
}

export async function recordStageWorkContactOutcomeTrace(input: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    opportunityId: string;
    stageKey: string;
    workId: string;
    workTemplateKey: string;
    outcomeKey: string;
    outcomeLabel: string;
    plan: StageOperatingPlanV1;
    departmentMetadata?: Record<string, unknown> | null;
    declaration?: { provenance: "integrated" | "external_manual"; channel?: string | null } | null;
}): Promise<{ logged: boolean; event_id?: string; error?: string }> {
    if (
        !workOutcomeRequiresCommunicationTrace({
            plan: input.plan,
            workTemplateKey: input.workTemplateKey,
            outcomeKey: input.outcomeKey,
            departmentMetadata: input.departmentMetadata,
        })
    ) {
        return { logged: false };
    }

    const now = new Date().toISOString();
    const summary = `Contact attempt recorded — ${input.outcomeLabel.trim() || input.outcomeKey}`;

    try {
        const event_id = await emitEvent({
            org_id: input.orgId,
            event_type: "stage_work_outcome_recorded",
            entity_type: "opportunities",
            entity_id: input.opportunityId,
            action_type: "stage_work_outcome",
            occurred_at: now,
            payload: {
                summary,
                outcome_key: input.outcomeKey,
                outcome_label: input.outcomeLabel,
                stage_key: input.stageKey,
                work_id: input.workId,
                work_template_key: input.workTemplateKey,
                communication_trace: true,
                actor_user_id: input.userId,
                contact_provenance: input.declaration?.provenance ?? null,
                contact_channel: input.declaration?.channel ?? null,
            },
        });

        const { data: opp } = await input.supabase
            .from("opportunities")
            .select("metadata")
            .eq("id", input.opportunityId)
            .eq("org_id", input.orgId)
            .maybeSingle();

        const md =
            opp?.metadata != null && typeof opp.metadata === "object" && !Array.isArray(opp.metadata)
                ? { ...(opp.metadata as Record<string, unknown>) }
                : {};
        md.last_contact_attempt_at = now;
        md.last_contact_outcome_key = input.outcomeKey;
        md.last_contact_outcome_label = input.outcomeLabel;
        md.last_stage_work_outcome_event_id = event_id;
        if (input.declaration?.provenance) md.last_contact_provenance = input.declaration.provenance;
        if (input.declaration?.channel) md.last_contact_channel = input.declaration.channel;

        await input.supabase
            .from("opportunities")
            .update({ metadata: md, updated_at: now })
            .eq("id", input.opportunityId)
            .eq("org_id", input.orgId);

        const { data: task } = await input.supabase
            .from("operational_tasks")
            .select("metadata")
            .eq("id", input.workId)
            .eq("org_id", input.orgId)
            .maybeSingle();

        const taskMd =
            task?.metadata != null && typeof task.metadata === "object" && !Array.isArray(task.metadata)
                ? { ...(task.metadata as Record<string, unknown>) }
                : {};
        taskMd.communication_trace_event_id = event_id;
        taskMd.last_contact_outcome_key = input.outcomeKey;

        await input.supabase
            .from("operational_tasks")
            .update({ metadata: taskMd, updated_at: now })
            .eq("id", input.workId)
            .eq("org_id", input.orgId);

        return { logged: true, event_id };
    } catch (e: unknown) {
        return { logged: false, error: (e as Error).message ?? "trace_failed" };
    }
}

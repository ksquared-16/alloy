/**
 * THE BUSINESS EVENT, NOT ITS MECHANICS.
 *
 * Recording an outcome or choosing a child's path wrote only its mechanics into Activity: a status
 * write and a stage write per child ("Ava moved to Waitlist", "Ava moved to Offered"), a booking
 * cancellation for a tour closed by its outcome, and nothing at all for the outcome itself unless it
 * was a follow-up contact attempt. Operators read the mechanics as the story.
 *
 * These are the events that say what the operator did. They carry the subject (family, and the child
 * where there is one) so the shared activity normalizer can fold the mechanics into them — the
 * mechanics stay in the ledger, untouched. Best-effort: Activity is a record of the change, never a
 * condition of it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { emitEvent } from "@/lib/emitEvent";

export const STAGE_OUTCOME_ACTIVITY_EVENT = "stage_work_outcome_recorded" as const;
export const PARTICIPANT_DECISION_ACTIVITY_EVENT = "participant_decision_recorded" as const;

type ChildRef = {
    customerMemberId?: string | null;
    opportunityCustomerMemberId?: string | null;
    childDisplayName?: string | null;
};

/**
 * Complete the child's identity the way the child's own lifecycle events carry it (participation id
 * and display name), so the normalizer can match them however the caller named the child.
 */
async function resolveChild(
    supabase: SupabaseClient | null | undefined,
    orgId: string,
    opportunityId: string,
    child: ChildRef | null | undefined,
): Promise<ChildRef | null> {
    if (!child) return null;
    const id = child.customerMemberId?.trim() || null;
    if (!supabase || !id) return child;
    const out: ChildRef = { ...child };
    try {
        if (!out.opportunityCustomerMemberId?.trim()) {
            const { data } = await supabase
                .from("opportunity_customer_members")
                .select("id")
                .eq("org_id", orgId)
                .eq("opportunity_id", opportunityId)
                .eq("customer_member_id", id)
                .limit(1);
            out.opportunityCustomerMemberId = ((data ?? []) as { id: string }[])[0]?.id ?? null;
        }
        if (!out.childDisplayName?.trim()) {
            const { data } = await supabase
                .from("customer_members")
                .select("first_name, last_name, display_name")
                .eq("org_id", orgId)
                .eq("id", id)
                .maybeSingle();
            const r = data as { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null;
            out.childDisplayName =
                [r?.first_name?.trim(), r?.last_name?.trim()].filter(Boolean).join(" ") || r?.display_name?.trim() || null;
        }
    } catch {
        // Identity enrichment only; the event is still recorded with what the caller supplied.
    }
    return out;
}

function childPayload(child: ChildRef | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    const id = child?.customerMemberId?.trim();
    const ocm = child?.opportunityCustomerMemberId?.trim();
    const name = child?.childDisplayName?.trim();
    if (id) out.customer_member_id = id;
    if (ocm) out.opportunity_customer_member_id = ocm;
    if (name) out.child_display_name = name;
    return out;
}

export async function recordStageOutcomeActivity(input: {
    supabase?: SupabaseClient | null;
    orgId: string;
    opportunityId: string;
    userId: string;
    stageKey: string;
    workId: string;
    workTemplateKey: string;
    outcomeKey: string;
    outcomeLabel: string;
    child?: ChildRef | null;
    correlationId?: string | null;
}): Promise<void> {
    try {
        await emitEvent({
            org_id: input.orgId,
            event_type: STAGE_OUTCOME_ACTIVITY_EVENT,
            entity_type: "opportunities",
            entity_id: input.opportunityId,
            action_type: "stage_work_outcome",
            occurred_at: new Date().toISOString(),
            payload: {
                business_outcome: true,
                outcome_key: input.outcomeKey,
                outcome_label: input.outcomeLabel,
                stage_key: input.stageKey,
                work_id: input.workId,
                work_template_key: input.workTemplateKey,
                actor_user_id: input.userId,
                correlation_id: input.correlationId ?? null,
                ...childPayload(await resolveChild(input.supabase, input.orgId, input.opportunityId, input.child)),
            },
        });
    } catch (e) {
        console.warn("[recordStageOutcomeActivity]", e instanceof Error ? e.message : e);
    }
}

export async function recordParticipantDecisionActivity(input: {
    supabase?: SupabaseClient | null;
    orgId: string;
    opportunityId: string;
    userId: string;
    stageKey: string;
    decisionKey: string;
    decisionLabel: string;
    answers: ReadonlyArray<{ label: string; value_label: string }>;
    child: ChildRef;
    correlationId?: string | null;
}): Promise<void> {
    try {
        await emitEvent({
            org_id: input.orgId,
            event_type: PARTICIPANT_DECISION_ACTIVITY_EVENT,
            entity_type: "opportunities",
            entity_id: input.opportunityId,
            action_type: "participant_decision",
            occurred_at: new Date().toISOString(),
            payload: {
                decision_key: input.decisionKey,
                decision_label: input.decisionLabel,
                stage_key: input.stageKey,
                answers: input.answers.map((a) => ({ label: a.label, value_label: a.value_label })),
                actor_user_id: input.userId,
                correlation_id: input.correlationId ?? null,
                ...childPayload(await resolveChild(input.supabase, input.orgId, input.opportunityId, input.child)),
            },
        });
    } catch (e) {
        console.warn("[recordParticipantDecisionActivity]", e instanceof Error ? e.message : e);
    }
}

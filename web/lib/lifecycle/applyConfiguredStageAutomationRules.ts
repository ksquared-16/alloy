/**
 * Apply configured stage_operating_plan_v1 automation rules on status entry or domain signals.
 * Process-agnostic — rule matching is driven entirely by plan metadata.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { listEffectiveStageOperatingPlansForProcess } from "@/lib/lifecycle/listEffectiveStageOperatingPlansForProcess";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import {
    applyStageOutcomeRuleTarget,
    type StageOutcomeExecutionSubject,
} from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";
import {
    domainSignalRulesForSignal,
    statusEntryRulesForStatusKey,
    type StageOperatingPlanV1,
    type StageOutcomeRuleV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

export type ApplyConfiguredStageAutomationRulesResult = {
    applied_rule_keys: string[];
    errors: string[];
    needs_attention_set: boolean;
    status_updated: boolean;
};

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function resolveActorUserId(actorUserId?: string | null): string {
    return trimOrNull(actorUserId) ?? DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID;
}

async function applyMatchedRules(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        userId: string;
        departmentId: string;
        opportunityId: string;
        departmentMetadata: Record<string, unknown>;
        matched: Array<{ stageKey: string; plan: StageOperatingPlanV1; rule: StageOutcomeRuleV1 }>;
    },
): Promise<ApplyConfiguredStageAutomationRulesResult> {
    const subject: StageOutcomeExecutionSubject = {
        journey_segment: "family",
        opportunity_id: params.opportunityId,
    };
    const applied_rule_keys: string[] = [];
    const errors: string[] = [];
    let needs_attention_set = false;
    let status_updated = false;

    for (const { stageKey, plan, rule } of params.matched) {
        for (const target of rule.targets) {
            const result = await applyStageOutcomeRuleTarget(supabase, {
                orgId: params.orgId,
                userId: params.userId,
                departmentId: params.departmentId,
                stageKey,
                plan,
                subject,
                target,
            });
            applied_rule_keys.push(rule.rule_key);
            if (result.error) errors.push(result.error);
            if (result.needs_attention) needs_attention_set = true;
            if (result.status_updated) status_updated = true;
        }
    }

    return { applied_rule_keys, errors, needs_attention_set, status_updated };
}

async function loadDepartmentMetadata(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return null;
    return data.metadata != null && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {};
}

export async function applyConfiguredStageRulesForStatusEntry(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    nextStatusKey: string | null;
    actorUserId?: string | null;
}): Promise<ApplyConfiguredStageAutomationRulesResult> {
    const orgId = input.orgId.trim();
    const opportunityId = input.opportunityId.trim();
    const nextStatusKey = trimOrNull(input.nextStatusKey);
    if (!orgId || !opportunityId || !nextStatusKey) {
        return { applied_rule_keys: [], errors: [], needs_attention_set: false, status_updated: false };
    }

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: input.supabase,
        orgId,
        opportunityId,
    });
    if (!departmentId) {
        return { applied_rule_keys: [], errors: [], needs_attention_set: false, status_updated: false };
    }

    const departmentMetadata = await loadDepartmentMetadata(input.supabase, orgId, departmentId);
    if (!departmentMetadata) {
        return { applied_rule_keys: [], errors: [], needs_attention_set: false, status_updated: false };
    }

    const matched: Array<{ stageKey: string; plan: StageOperatingPlanV1; rule: StageOutcomeRuleV1 }> = [];
    for (const entry of listEffectiveStageOperatingPlansForProcess(departmentMetadata)) {
        for (const rule of statusEntryRulesForStatusKey(entry.plan, nextStatusKey)) {
            matched.push({ stageKey: entry.stageKey, plan: entry.plan, rule });
        }
    }

    if (!matched.length) {
        return { applied_rule_keys: [], errors: [], needs_attention_set: false, status_updated: false };
    }

    return applyMatchedRules(input.supabase, {
        orgId,
        userId: resolveActorUserId(input.actorUserId),
        departmentId,
        opportunityId,
        departmentMetadata,
        matched,
    });
}

export async function applyConfiguredStageRulesForDomainSignal(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    domain: string;
    signal: string;
    actorUserId?: string | null;
}): Promise<ApplyConfiguredStageAutomationRulesResult> {
    const orgId = input.orgId.trim();
    const opportunityId = input.opportunityId.trim();
    const domain = trimOrNull(input.domain);
    const signal = trimOrNull(input.signal);
    if (!orgId || !opportunityId || !domain || !signal) {
        return { applied_rule_keys: [], errors: [], needs_attention_set: false, status_updated: false };
    }

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: input.supabase,
        orgId,
        opportunityId,
    });
    if (!departmentId) {
        return { applied_rule_keys: [], errors: [], needs_attention_set: false, status_updated: false };
    }

    const departmentMetadata = await loadDepartmentMetadata(input.supabase, orgId, departmentId);
    if (!departmentMetadata) {
        return { applied_rule_keys: [], errors: [], needs_attention_set: false, status_updated: false };
    }

    const matched: Array<{ stageKey: string; plan: StageOperatingPlanV1; rule: StageOutcomeRuleV1 }> = [];
    for (const entry of listEffectiveStageOperatingPlansForProcess(departmentMetadata)) {
        for (const rule of domainSignalRulesForSignal(entry.plan, domain, signal)) {
            matched.push({ stageKey: entry.stageKey, plan: entry.plan, rule });
        }
    }

    if (!matched.length) {
        return { applied_rule_keys: [], errors: [], needs_attention_set: false, status_updated: false };
    }

    return applyMatchedRules(input.supabase, {
        orgId,
        userId: resolveActorUserId(input.actorUserId),
        departmentId,
        opportunityId,
        departmentMetadata,
        matched,
    });
}

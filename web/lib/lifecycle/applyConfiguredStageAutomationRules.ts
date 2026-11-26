/**
 * Apply configured stage_operating_plan_v1 automation rules on status entry or domain signals.
 * Process-agnostic — rule matching is driven entirely by plan metadata.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { listEffectiveStageOperatingPlansForProcess } from "@/lib/lifecycle/listEffectiveStageOperatingPlansForProcess";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { planStageOutcomeExecution } from "@/lib/lifecycle/planStageOutcomeExecution";
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
    /** Rules whose targets ALL succeeded. A rule that errored is never reported as applied. */
    applied_rule_keys: string[];
    /** Rules that were matched and attempted but did not fully apply. */
    failed_rule_keys: string[];
    errors: string[];
    /** Declared out-of-boundary effects that did not run. */
    degraded: string[];
    needs_attention_set: boolean;
    status_updated: boolean;
};

const EMPTY_RESULT: ApplyConfiguredStageAutomationRulesResult = {
    applied_rule_keys: [],
    failed_rule_keys: [],
    errors: [],
    degraded: [],
    needs_attention_set: false,
    status_updated: false,
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
    const failed_rule_keys: string[] = [];
    const errors: string[] = [];
    const degraded: string[] = [];
    let needs_attention_set = false;
    let status_updated = false;

    /**
     * PLAN PHASE — zero writes (Law 6).
     *
     * This loop used to call `applyStageOutcomeRuleTarget` directly, so a `move_to_stage` carrying
     * only `transition_ref` — the shape the editor writes — was never expanded and failed with
     * "Missing target stage key" AFTER the status target in the same rule had already committed.
     * Status moved, stage did not. Resolving everything first makes that impossible.
     */
    const executionPlan = planStageOutcomeExecution(params.matched);
    if (executionPlan.errors.length) {
        return {
            applied_rule_keys: [],
            failed_rule_keys: params.matched.map((m) => m.rule.rule_key),
            errors: executionPlan.errors,
            degraded,
            needs_attention_set,
            status_updated,
        };
    }

    // ── MUTATION PHASE ───────────────────────────────────────────────────────
    // Every inverse is captured as it is earned, so a mid-sequence failure can be undone. The
    // previous code discarded `result.undo` entirely, which is why a partial application was
    // permanent.
    const undo: Array<{ label: string; run: () => Promise<void> }> = [];
    const failedRules = new Set<string>();

    for (const step of executionPlan.steps) {
        const result = await applyStageOutcomeRuleTarget(supabase, {
            orgId: params.orgId,
            userId: params.userId,
            departmentId: params.departmentId,
            stageKey: step.stage_key,
            plan: step.plan,
            subject,
            target: step.executable,
        });
        if (result.undo) {
            undo.push({ label: `${step.rule_key}/${step.executable.kind}`, run: result.undo });
        }
        if (result.degraded) degraded.push(result.degraded);
        if (result.needs_attention) needs_attention_set = true;
        if (result.status_updated) status_updated = true;

        if (result.error) {
            errors.push(`${step.stage_key}/${step.rule_key}: ${result.error}`);
            failedRules.add(step.rule_key);
            // A durable failure mid-sequence: undo what this invocation has already done, newest
            // first, rather than leaving the record half-moved.
            for (let i = undo.length - 1; i >= 0; i -= 1) {
                try {
                    await undo[i]!.run();
                } catch (e) {
                    // An inverse that will not run is an integrity breach, and reporting a clean
                    // rollback here would be the false claim Law 6 forbids.
                    errors.push(
                        `compensation failed for ${undo[i]!.label}: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }
            }
            return {
                applied_rule_keys: [],
                failed_rule_keys: [...new Set(executionPlan.steps.map((s) => s.rule_key))],
                errors,
                degraded,
                needs_attention_set,
                status_updated,
            };
        }
    }

    for (const ruleKey of executionPlan.planned_rule_keys) {
        if (failedRules.has(ruleKey)) failed_rule_keys.push(ruleKey);
        else applied_rule_keys.push(ruleKey);
    }

    return { applied_rule_keys, failed_rule_keys, errors, degraded, needs_attention_set, status_updated };
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
        return EMPTY_RESULT;
    }

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: input.supabase,
        orgId,
        opportunityId,
    });
    if (!departmentId) {
        return EMPTY_RESULT;
    }

    const departmentMetadata = await loadDepartmentMetadata(input.supabase, orgId, departmentId);
    if (!departmentMetadata) {
        return EMPTY_RESULT;
    }

    const matched: Array<{ stageKey: string; plan: StageOperatingPlanV1; rule: StageOutcomeRuleV1 }> = [];
    for (const entry of listEffectiveStageOperatingPlansForProcess(departmentMetadata)) {
        for (const rule of statusEntryRulesForStatusKey(entry.plan, nextStatusKey)) {
            matched.push({ stageKey: entry.stageKey, plan: entry.plan, rule });
        }
    }

    if (!matched.length) {
        return EMPTY_RESULT;
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
        return EMPTY_RESULT;
    }

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: input.supabase,
        orgId,
        opportunityId,
    });
    if (!departmentId) {
        return EMPTY_RESULT;
    }

    const departmentMetadata = await loadDepartmentMetadata(input.supabase, orgId, departmentId);
    if (!departmentMetadata) {
        return EMPTY_RESULT;
    }

    const matched: Array<{ stageKey: string; plan: StageOperatingPlanV1; rule: StageOutcomeRuleV1 }> = [];
    for (const entry of listEffectiveStageOperatingPlansForProcess(departmentMetadata)) {
        for (const rule of domainSignalRulesForSignal(entry.plan, domain, signal)) {
            matched.push({ stageKey: entry.stageKey, plan: entry.plan, rule });
        }
    }

    if (!matched.length) {
        return EMPTY_RESULT;
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

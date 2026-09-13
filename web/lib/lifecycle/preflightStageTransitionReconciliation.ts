/**
 * Preflight: detect prior-stage open work / attention requiring reconciliation on stage change.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    activeLifecycleProcess,
    findStage,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { detectBuilderStageTransition } from "@/lib/lifecycle/detectBuilderStageTransition";
import { isBusinessProcessStageWorkTaskRow } from "@/lib/lifecycle/isBusinessProcessStageWorkTaskRow";
import { parseEnrollmentOperationalFromMetadata } from "@/lib/opportunities/enrollmentOperationalMetadata";
import { resolveEnrollmentDepartmentForOpportunity } from "@/lib/lifecycle/resolveStageWorkOutcomeContext";
import { evaluateTransitionRequirementPreflight } from "@/lib/lifecycle/evaluateTransitionRequirementPreflight";
import type { StageTransitionReconciliationPreflight } from "@/lib/lifecycle/stageTransitionReconciliationTypes";

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

async function loadStatusMetadata(
    supabase: SupabaseClient,
    orgId: string,
    statusKey: string | null,
): Promise<Record<string, unknown> | null> {
    const key = trimOrNull(statusKey);
    if (!key) return null;
    const { data } = await supabase
        .from("status_definitions")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .eq("status_key", key)
        .eq("is_active", true)
        .maybeSingle();
    const md = (data as { metadata?: unknown } | null)?.metadata;
    return md != null && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : null;
}

function stageLabelForKey(
    departmentMetadata: Record<string, unknown>,
    stageKey: string | null,
): string | null {
    if (!stageKey) return null;
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const stage = process ? findStage(process, stageKey) : null;
    return trimOrNull(stage?.label) ?? stageKey;
}

export async function preflightStageTransitionReconciliation(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    previousStatusKey: string | null;
    nextStatusKey: string;
}): Promise<StageTransitionReconciliationPreflight> {
    const orgId = params.orgId.trim();
    const opportunityId = params.opportunityId.trim();
    const nextStatusKey = trimOrNull(params.nextStatusKey) ?? "";
    const previousStatusKey = trimOrNull(params.previousStatusKey);

    const empty: StageTransitionReconciliationPreflight = {
        required: false,
        previous_builder_stage_key: null,
        next_builder_stage_key: null,
        previous_status_key: previousStatusKey,
        next_status_key: nextStatusKey,
        next_stage_label: null,
        open_work: [],
        has_attention: false,
        attention_reason: null,
        wait_bucket: null,
        missingRequirements: [],
        blockingRequirements: [],
        openWorkConflicts: [],
        canProceed: true,
    };

    if (!orgId || !opportunityId || !nextStatusKey) return empty;
    if (previousStatusKey === nextStatusKey) return empty;

    const departmentId = await resolveEnrollmentDepartmentForOpportunity({
        supabase: params.supabase,
        orgId,
        opportunityId,
    });
    if (!departmentId) return empty;

    const [{ data: dept }, { data: opp }, previousStatusMetadata, nextStatusMetadata, openRowsResult] =
        await Promise.all([
            params.supabase.from("departments").select("metadata").eq("id", departmentId).eq("org_id", orgId).maybeSingle(),
            params.supabase.from("opportunities").select("metadata").eq("id", opportunityId).eq("org_id", orgId).maybeSingle(),
            loadStatusMetadata(params.supabase, orgId, previousStatusKey),
            loadStatusMetadata(params.supabase, orgId, nextStatusKey),
            // Hoisted: this was already loaded further down to LIST conflicting work. It also names
            // the stage the record is departing, which has to be known before the transition is
            // detected — otherwise the departure stage is inferred from a status key that need not
            // name a stage at all.
            params.supabase
                .from("operational_tasks")
                .select("id, title, due_at, status, source, metadata")
                .eq("org_id", orgId)
                .eq("entity_type", "opportunities")
                .eq("entity_id", opportunityId)
                .eq("status", "open")
                .order("due_at", { ascending: true })
                .limit(48),
        ]);

    const departmentMetadata =
        dept?.metadata != null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    /*
     * THE STAGE THE RECORD IS ACTUALLY IN, FROM ITS OWN STAGE WORK.
     *
     * Stage work carries `lifecycle_stage_key` — it is the same durable stage the Process Card, the
     * queue projection and the work's own subject fingerprint read. The opportunity's `status_key`
     * is a rollup and need not name a stage: measured on staging, a case sat at `tour` with
     * `status_key: "open"`, its metadata held only tour_date/tour_time, and the org had no
     * status_definitions rows — so the departure stage resolved to null, no Tour requirement was
     * ever loaded, and a BLOCKING work requirement scoped to `tour_transition_2` let the exit
     * through. The requirement runtime was correct; it was being asked about the wrong stage.
     *
     * Only OPEN stage work is consulted, and only to name the stage — never to decide the outcome.
     * If several stages have open work, the record is departing the one the status does not name,
     * so a status-derived stage still wins when it resolves.
     */
    const openStageWorkRows = (openRowsResult.data ?? []).filter((row) =>
        isBusinessProcessStageWorkTaskRow(row as { metadata?: Record<string, unknown>; source?: string }),
    );
    const stageKeysFromOpenWork = openStageWorkRows
        .map((row) => {
            const md = ((row as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
            return trimOrNull(md.lifecycle_stage_key);
        })
        .filter((key): key is string => key != null);

    const transition = detectBuilderStageTransition({
        previousStatusKey,
        nextStatusKey,
        departmentMetadata,
        previousStatusMetadata,
        nextStatusMetadata,
        currentBuilderStageKey: stageKeysFromOpenWork[0] ?? null,
    });

    const nextStageLabel = stageLabelForKey(departmentMetadata, transition.nextBuilderStageKey);

    const requirementPreflight = await evaluateTransitionRequirementPreflight({
        supabase: params.supabase,
        orgId,
        opportunityId,
        departmentMetadata,
        fromBuilderStageKey: transition.previousBuilderStageKey,
        toBuilderStageKey: transition.nextBuilderStageKey,
        previousStatusKey,
        nextStatusKey,
        nextStageLabel,
    });

    const oppMetadata =
        opp?.metadata != null && typeof opp.metadata === "object" && !Array.isArray(opp.metadata)
            ? (opp.metadata as Record<string, unknown>)
            : {};
    const enrollmentOp = parseEnrollmentOperationalFromMetadata(oppMetadata);
    const hasAttention = enrollmentOp.wait_bucket !== "none";

    if (!transition.stageChanged || !transition.nextBuilderStageKey) {
        const workRequired = hasAttention;
        return {
            ...empty,
            next_stage_label: nextStageLabel,
            has_attention: hasAttention,
            attention_reason: enrollmentOp.wait_reason,
            wait_bucket: enrollmentOp.wait_bucket !== "none" ? enrollmentOp.wait_bucket : null,
            missingRequirements: requirementPreflight.missingRequirements,
            blockingRequirements: requirementPreflight.blockingRequirements,
            required: workRequired || requirementPreflight.blockingRequirements.length > 0,
            canProceed:
                requirementPreflight.blockingRequirements.length === 0 && !workRequired,
        };
    }

    const { data: openRows, error } = openRowsResult;

    if (error) {
        const blocking = requirementPreflight.blockingRequirements;
        return {
            ...empty,
            previous_builder_stage_key: transition.previousBuilderStageKey,
            next_builder_stage_key: transition.nextBuilderStageKey,
            next_stage_label: nextStageLabel,
            has_attention: hasAttention,
            attention_reason: enrollmentOp.wait_reason,
            wait_bucket: enrollmentOp.wait_bucket !== "none" ? enrollmentOp.wait_bucket : null,
            missingRequirements: requirementPreflight.missingRequirements,
            blockingRequirements: blocking,
            required: blocking.length > 0 || hasAttention,
            canProceed: blocking.length === 0 && !hasAttention,
        };
    }

    const nextStageKey = transition.nextBuilderStageKey;
    const openWork = (openRows ?? [])
        .filter((row) => isBusinessProcessStageWorkTaskRow(row as { metadata?: Record<string, unknown>; source?: string }))
        .map((row) => {
            const md = ((row as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
            const lifecycleStageKey = trimOrNull(md.lifecycle_stage_key) ?? "";
            return { row, lifecycleStageKey, md };
        })
        .filter(({ lifecycleStageKey }) => lifecycleStageKey && lifecycleStageKey !== nextStageKey)
        .map(({ row, lifecycleStageKey, md }) => ({
            work_id: String((row as { id: string }).id),
            title: trimOrNull((row as { title?: string }).title) ?? "Task",
            lifecycle_stage_key: lifecycleStageKey,
            stage_label: stageLabelForKey(departmentMetadata, lifecycleStageKey),
            template_key: trimOrNull(md.operating_plan_template_key) ?? trimOrNull(md.work_intent_key),
            work_definition_key: trimOrNull(md.work_definition_key),
            due_at: trimOrNull((row as { due_at?: string }).due_at),
        }));

    const workRequired = openWork.length > 0 || hasAttention;
    const blocking = requirementPreflight.blockingRequirements;

    return {
        required: workRequired || blocking.length > 0,
        previous_builder_stage_key: transition.previousBuilderStageKey,
        next_builder_stage_key: transition.nextBuilderStageKey,
        previous_status_key: previousStatusKey,
        next_status_key: nextStatusKey,
        next_stage_label: nextStageLabel,
        open_work: openWork,
        openWorkConflicts: openWork,
        has_attention: hasAttention,
        attention_reason: enrollmentOp.wait_reason,
        wait_bucket: enrollmentOp.wait_bucket !== "none" ? enrollmentOp.wait_bucket : null,
        missingRequirements: requirementPreflight.missingRequirements,
        blockingRequirements: blocking,
        canProceed: blocking.length === 0 && !workRequired,
    };
}

/**
 * Apply operator reconciliation choices for prior-stage open work and attention.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelWorkInstance, completeWorkInstance } from "@/lib/admin/operationalWork/operationalWorkService";
import {
    mergeEnrollmentOperationalIntoMetadata,
    sanitizeEnrollmentOperationalPatch,
} from "@/lib/opportunities/enrollmentOperationalMetadata";
import type {
    ApplyStageTransitionReconciliationResult,
    StageTransitionReconciliationPayload,
    StageTransitionReconciliationPreflight,
} from "@/lib/lifecycle/stageTransitionReconciliationTypes";

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

async function carryForwardWork(params: {
    supabase: SupabaseClient;
    orgId: string;
    workId: string;
    fromStageKey: string;
    actorUserId: string;
}): Promise<{ error?: string }> {
    const { data: row, error: loadErr } = await params.supabase
        .from("operational_tasks")
        .select("id, metadata")
        .eq("id", params.workId)
        .eq("org_id", params.orgId)
        .eq("status", "open")
        .maybeSingle();
    if (loadErr || !row) return { error: loadErr?.message ?? "Task not found" };

    const md =
        row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? { ...(row.metadata as Record<string, unknown>) }
            : {};

    const merged: Record<string, unknown> = {
        ...md,
        lifecycle_provenance: "stage_reconciliation_carry_forward",
        operating_plan_template: false,
        stage_reconciliation: {
            resolution: "carry_forward",
            from_stage_key: params.fromStageKey,
            reconciled_at: new Date().toISOString(),
            reconciled_by: params.actorUserId,
        },
    };
    delete merged.bp_runtime_fingerprint;

    const { error: upErr } = await params.supabase
        .from("operational_tasks")
        .update({ metadata: merged, updated_at: new Date().toISOString() })
        .eq("id", params.workId)
        .eq("org_id", params.orgId)
        .eq("status", "open");
    if (upErr) return { error: upErr.message };
    return {};
}

async function stampReconciledWorkMetadata(params: {
    supabase: SupabaseClient;
    orgId: string;
    workId: string;
    resolution: "completed" | "skipped";
    fromStageKey: string;
    actorUserId: string;
}): Promise<void> {
    const { data: row } = await params.supabase
        .from("operational_tasks")
        .select("metadata")
        .eq("id", params.workId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    const md =
        row?.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? { ...(row.metadata as Record<string, unknown>) }
            : {};
    md.stage_reconciliation = {
        resolution: params.resolution,
        from_stage_key: params.fromStageKey,
        reconciled_at: new Date().toISOString(),
        reconciled_by: params.actorUserId,
    };
    await params.supabase
        .from("operational_tasks")
        .update({ metadata: md, updated_at: new Date().toISOString() })
        .eq("id", params.workId)
        .eq("org_id", params.orgId);
}

export async function applyStageTransitionReconciliation(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    actorUserId: string;
    preflight: StageTransitionReconciliationPreflight;
    reconciliation: StageTransitionReconciliationPayload;
}): Promise<ApplyStageTransitionReconciliationResult> {
    const applied_work: string[] = [];
    const errors: string[] = [];
    let attention_applied = false;

    const workById = new Map(params.preflight.open_work.map((w) => [w.work_id, w]));
    const seen = new Set<string>();

    for (const choice of params.reconciliation.work) {
        const workId = trimOrNull(choice.work_id);
        if (!workId || seen.has(workId)) continue;
        seen.add(workId);

        const item = workById.get(workId);
        if (!item) {
            errors.push(`Unknown work item: ${workId}`);
            continue;
        }

        const fromStage = item.lifecycle_stage_key;

        if (choice.resolution === "completed") {
            const result = await completeWorkInstance({
                supabase: params.supabase,
                orgId: params.orgId,
                workId,
            });
            if (!result.ok) {
                errors.push(result.message);
                continue;
            }
            await stampReconciledWorkMetadata({
                supabase: params.supabase,
                orgId: params.orgId,
                workId,
                resolution: "completed",
                fromStageKey: fromStage,
                actorUserId: params.actorUserId,
            });
            applied_work.push(workId);
            continue;
        }

        if (choice.resolution === "skipped") {
            const result = await cancelWorkInstance({
                supabase: params.supabase,
                orgId: params.orgId,
                workId,
            });
            if (!result.ok) {
                errors.push(result.message);
                continue;
            }
            await stampReconciledWorkMetadata({
                supabase: params.supabase,
                orgId: params.orgId,
                workId,
                resolution: "skipped",
                fromStageKey: fromStage,
                actorUserId: params.actorUserId,
            });
            applied_work.push(workId);
            continue;
        }

        if (choice.resolution === "carry_forward") {
            const result = await carryForwardWork({
                supabase: params.supabase,
                orgId: params.orgId,
                workId,
                fromStageKey: fromStage,
                actorUserId: params.actorUserId,
            });
            if (result.error) {
                errors.push(result.error);
                continue;
            }
            applied_work.push(workId);
        }
    }

    for (const item of params.preflight.open_work) {
        if (!seen.has(item.work_id)) {
            errors.push(`Missing reconciliation for work: ${item.title}`);
        }
    }

    if (params.preflight.has_attention) {
        const attentionResolution = params.reconciliation.attention ?? "cleared";
        const { data: opp } = await params.supabase
            .from("opportunities")
            .select("metadata")
            .eq("id", params.opportunityId)
            .eq("org_id", params.orgId)
            .maybeSingle();

        const metadata =
            opp?.metadata != null && typeof opp.metadata === "object" && !Array.isArray(opp.metadata)
                ? (opp.metadata as Record<string, unknown>)
                : {};

        if (attentionResolution === "cleared") {
            const patch = sanitizeEnrollmentOperationalPatch({
                wait_bucket: "none",
                wait_reason: null,
                wait_since: null,
            });
            const merged = mergeEnrollmentOperationalIntoMetadata(metadata, patch ?? { wait_bucket: "none" });
            await params.supabase
                .from("opportunities")
                .update({ metadata: merged, updated_at: new Date().toISOString() })
                .eq("id", params.opportunityId)
                .eq("org_id", params.orgId);
            attention_applied = true;
        } else {
            const merged = mergeEnrollmentOperationalIntoMetadata(metadata, {
                wait_bucket:
                    (params.preflight.wait_bucket as "waiting_on_staff" | "waiting_on_family" | undefined) ??
                    "waiting_on_staff",
                wait_reason: params.preflight.attention_reason ?? "Carried forward from prior stage",
            });
            const withReconciliation = {
                ...merged,
                stage_reconciliation: {
                    attention_carried_forward: true,
                    from_builder_stage_key: params.preflight.previous_builder_stage_key,
                    reconciled_at: new Date().toISOString(),
                },
            };
            await params.supabase
                .from("opportunities")
                .update({ metadata: withReconciliation, updated_at: new Date().toISOString() })
                .eq("id", params.opportunityId)
                .eq("org_id", params.orgId);
            attention_applied = true;
        }
    }

    return { applied_work, errors, attention_applied };
}

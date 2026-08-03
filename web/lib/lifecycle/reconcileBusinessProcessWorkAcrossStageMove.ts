/**
 * Reconcile Business Process work across an outcome-driven stage move.
 *
 * Each existing or destination-expected work item resolves to exactly one lifecycle result:
 *   completed | carried_forward | canceled | superseded | created
 *
 * Identity is process subject + semantic work definition (not stage). Stage determines
 * expected work and applicability. Carry-forward preserves operational_tasks.id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelWorkInstance } from "@/lib/admin/operationalWork/operationalWorkService";
import {
    buildBusinessProcessWorkRuntimeFingerprint,
    resolveBusinessProcessSemanticWorkKey,
} from "@/lib/lifecycle/buildBusinessProcessWorkRuntimeFingerprint";
import { isBusinessProcessStageWorkTaskRow } from "@/lib/lifecycle/isBusinessProcessStageWorkTaskRow";
import { instantiateStageWorkFromTemplate } from "@/lib/lifecycle/instantiateStageWorkFromTemplate";
import { resolveEffectiveWorkDefinitionKeyFromTemplate } from "@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { resolveDestinationStageEntryTemplates } from "@/lib/lifecycle/spawnDestinationStageEntryWork";
import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageWorkReconciliationLifecycleResult =
    | "completed"
    | "carried_forward"
    | "canceled"
    | "superseded"
    | "created";

export type StageWorkReconciliationItem = {
    work_id: string;
    result: StageWorkReconciliationLifecycleResult;
    semantic_work_key: string | null;
    template_key: string | null;
    from_stage_key: string | null;
    to_stage_key: string | null;
};

export type ReconcileBusinessProcessWorkAcrossStageMoveResult = {
    items: StageWorkReconciliationItem[];
    /** True when a second pass would produce the same lifecycle set (no new creates/cancels). */
    idempotent_noop: boolean;
    degraded?: string;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function templateSemanticKey(
    template: Pick<StageWorkTemplateV1, "template_key" | "work_definition_key">,
    departmentMetadata: Record<string, unknown>,
    stageKey: string,
): string {
    const resolved = resolveEffectiveWorkDefinitionKeyFromTemplate(template, {
        departmentMetadata,
        stageKey,
    });
    if (resolved.ok) return resolved.work_definition_key;
    return (
        resolveBusinessProcessSemanticWorkKey({
            workDefinitionKey: template.work_definition_key,
            templateKey: template.template_key,
        }) ?? template.template_key
    );
}

function rowSemanticKey(md: Record<string, unknown>): string | null {
    return resolveBusinessProcessSemanticWorkKey({
        workDefinitionKey: trimOrNull(md.work_definition_key),
        templateKey: trimOrNull(md.operating_plan_template_key) ?? trimOrNull(md.work_intent_key),
    });
}

function rowTemplateKey(md: Record<string, unknown>): string | null {
    return trimOrNull(md.operating_plan_template_key) ?? trimOrNull(md.work_intent_key);
}

async function stampCarryForward(params: {
    supabase: SupabaseClient;
    orgId: string;
    workId: string;
    opportunityId: string;
    fromStageKey: string;
    toStageKey: string;
    destinationTemplate: StageWorkTemplateV1;
    semanticWorkKey: string;
    actorUserId: string;
    departmentMetadata: Record<string, unknown>;
}): Promise<{ error?: string }> {
    const { data: row, error: loadErr } = await params.supabase
        .from("operational_tasks")
        .select("id, metadata, status")
        .eq("id", params.workId)
        .eq("org_id", params.orgId)
        .maybeSingle();
    if (loadErr || !row) return { error: loadErr?.message ?? "Task not found" };
    if ((row as { status?: string }).status !== "open") {
        return {};
    }

    const md =
        row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? { ...(row.metadata as Record<string, unknown>) }
            : {};

    const fingerprint = buildBusinessProcessWorkRuntimeFingerprint({
        orgId: params.orgId,
        entityType: "opportunities",
        entityId: params.opportunityId,
        workDefinitionKey: params.semanticWorkKey,
        templateKey: params.destinationTemplate.template_key,
    });

    const nowIso = new Date().toISOString();
    const merged: Record<string, unknown> = {
        ...md,
        lifecycle_provenance: "lifecycle_template",
        operating_plan_template: true,
        operating_plan_template_key: params.destinationTemplate.template_key,
        work_intent_key: params.destinationTemplate.template_key,
        work_definition_key: params.semanticWorkKey,
        lifecycle_stage_key: params.toStageKey,
        bp_runtime_fingerprint: fingerprint,
        stage_work_reconciliation: {
            result: "carried_forward",
            from_stage_key: params.fromStageKey,
            to_stage_key: params.toStageKey,
            semantic_work_key: params.semanticWorkKey,
            reconciled_at: nowIso,
            reconciled_by: params.actorUserId,
        },
    };

    const { error: upErr } = await params.supabase
        .from("operational_tasks")
        .update({ metadata: merged, updated_at: nowIso })
        .eq("id", params.workId)
        .eq("org_id", params.orgId)
        .eq("status", "open");
    if (upErr) return { error: upErr.message };
    return {};
}

async function stampTerminalReconciliation(params: {
    supabase: SupabaseClient;
    orgId: string;
    workId: string;
    result: "canceled" | "superseded";
    fromStageKey: string;
    toStageKey: string;
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
    md.stage_work_reconciliation = {
        result: params.result,
        from_stage_key: params.fromStageKey,
        to_stage_key: params.toStageKey,
        reconciled_at: new Date().toISOString(),
        reconciled_by: params.actorUserId,
    };
    await params.supabase
        .from("operational_tasks")
        .update({ metadata: md, updated_at: new Date().toISOString() })
        .eq("id", params.workId)
        .eq("org_id", params.orgId);
}

/**
 * After durable stage membership changes, reconcile open BP work against the destination plan.
 * Idempotent across retries and projection refreshes.
 */
export async function reconcileBusinessProcessWorkAcrossStageMove(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    opportunityId: string;
    departmentId: string;
    sourceStageKey: string;
    destinationStageKey: string;
    departmentMetadata: Record<string, unknown>;
    /** Work already completed by the initiating outcome — reported as completed, never canceled. */
    initiatingWorkId?: string | null;
    now?: Date;
}): Promise<ReconcileBusinessProcessWorkAcrossStageMoveResult> {
    const orgId = params.orgId.trim();
    const opportunityId = params.opportunityId.trim();
    const sourceStageKey = params.sourceStageKey.trim();
    const destinationStageKey = params.destinationStageKey.trim();
    const initiatingWorkId = trimOrNull(params.initiatingWorkId);
    const items: StageWorkReconciliationItem[] = [];
    let mutated = false;

    if (!orgId || !opportunityId || !destinationStageKey) {
        return { items, idempotent_noop: true, degraded: "missing_scope" };
    }

    if (initiatingWorkId) {
        items.push({
            work_id: initiatingWorkId,
            result: "completed",
            semantic_work_key: null,
            template_key: null,
            from_stage_key: sourceStageKey || null,
            to_stage_key: destinationStageKey,
        });
    }

    const { plan: destinationPlan } = resolveEffectiveStageOperatingPlan({
        departmentMetadata: params.departmentMetadata,
        builderStageKey: destinationStageKey,
    });

    const destinationTemplates = destinationPlan?.work_templates ?? [];
    const destinationBySemantic = new Map<string, StageWorkTemplateV1>();
    for (const template of destinationTemplates) {
        const key = templateSemanticKey(template, params.departmentMetadata, destinationStageKey);
        if (!destinationBySemantic.has(key)) destinationBySemantic.set(key, template);
    }

    const { data: openRows, error: openErr } = await params.supabase
        .from("operational_tasks")
        .select("id, title, status, source, metadata, updated_at")
        .eq("org_id", orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", opportunityId)
        .eq("status", "open")
        .order("updated_at", { ascending: true })
        .limit(64);

    if (openErr) {
        return {
            items,
            idempotent_noop: true,
            degraded: `open work load failed: ${openErr.message}`,
        };
    }

    const claimedDestinationSemantics = new Set<string>();
    const openBp = (openRows ?? []).filter((row) =>
        isBusinessProcessStageWorkTaskRow(row as { metadata?: Record<string, unknown>; source?: string }),
    );

    for (const row of openBp) {
        const workId = String((row as { id: string }).id);
        if (initiatingWorkId && workId === initiatingWorkId) continue;

        const md =
            row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        const semantic = rowSemanticKey(md);
        const templateKey = rowTemplateKey(md);
        const taskStage = trimOrNull(md.lifecycle_stage_key);

        // Already at destination with matching semantic identity — treat as satisfied (idempotent).
        if (
            semantic
            && taskStage === destinationStageKey
            && destinationBySemantic.has(semantic)
        ) {
            claimedDestinationSemantics.add(semantic);
            continue;
        }

        const destTemplate = semantic ? destinationBySemantic.get(semantic) : undefined;
        if (destTemplate && semantic) {
            const carry = await stampCarryForward({
                supabase: params.supabase,
                orgId,
                workId,
                opportunityId,
                fromStageKey: taskStage ?? sourceStageKey,
                toStageKey: destinationStageKey,
                destinationTemplate: destTemplate,
                semanticWorkKey: semantic,
                actorUserId: params.userId,
                departmentMetadata: params.departmentMetadata,
            });
            if (carry.error) {
                return {
                    items,
                    idempotent_noop: !mutated,
                    degraded: `carry_forward failed for ${workId}: ${carry.error}`,
                };
            }
            claimedDestinationSemantics.add(semantic);
            mutated = true;
            items.push({
                work_id: workId,
                result: "carried_forward",
                semantic_work_key: semantic,
                template_key: destTemplate.template_key,
                from_stage_key: taskStage ?? (sourceStageKey || null),
                to_stage_key: destinationStageKey,
            });
            continue;
        }

        // Obsolete prior-stage work: cancel (or supersede when a different destination primary exists).
        const entryTemplates = resolveDestinationStageEntryTemplates({
            departmentMetadata: params.departmentMetadata,
            destinationStageKey,
        }).templates;
        const destinationPrimary = entryTemplates[0] ?? null;
        const destinationPrimarySemantic = destinationPrimary
            ? templateSemanticKey(destinationPrimary, params.departmentMetadata, destinationStageKey)
            : null;
        const wasSourcePrimary =
            md.operating_plan_template === true
            && (trimOrNull(md.lifecycle_stage_key) === sourceStageKey || !trimOrNull(md.lifecycle_stage_key));
        const result: "canceled" | "superseded" =
            wasSourcePrimary
            && destinationPrimarySemantic
            && semantic
            && destinationPrimarySemantic !== semantic
                ? "superseded"
                : "canceled";

        await stampTerminalReconciliation({
            supabase: params.supabase,
            orgId,
            workId,
            result,
            fromStageKey: taskStage ?? sourceStageKey,
            toStageKey: destinationStageKey,
            actorUserId: params.userId,
        });
        const canceled = await cancelWorkInstance({
            supabase: params.supabase,
            orgId,
            workId,
        });
        if (!canceled.ok) {
            return {
                items,
                idempotent_noop: !mutated,
                degraded: `${result} failed for ${workId}: ${canceled.message ?? canceled.error}`,
            };
        }
        mutated = true;
        items.push({
            work_id: workId,
            result,
            semantic_work_key: semantic,
            template_key: templateKey,
            from_stage_key: taskStage ?? (sourceStageKey || null),
            to_stage_key: destinationStageKey,
        });
    }

    // Create destination-expected entry work only when no carried identity satisfies it.
    const entry = resolveDestinationStageEntryTemplates({
        departmentMetadata: params.departmentMetadata,
        destinationStageKey,
    });
    for (const template of entry.templates) {
        const semantic = templateSemanticKey(template, params.departmentMetadata, destinationStageKey);
        if (claimedDestinationSemantics.has(semantic)) continue;

        const created = await instantiateStageWorkFromTemplate({
            supabase: params.supabase,
            orgId,
            userId: params.userId,
            opportunityId,
            stageKey: destinationStageKey,
            departmentId: params.departmentId,
            template,
            departmentMetadata: params.departmentMetadata,
            now: params.now,
        });

        if (created.status === "created") {
            mutated = true;
            claimedDestinationSemantics.add(semantic);
            items.push({
                work_id: created.work_id,
                result: "created",
                semantic_work_key: semantic,
                template_key: template.template_key,
                from_stage_key: sourceStageKey || null,
                to_stage_key: destinationStageKey,
            });
            continue;
        }
        if (created.status === "deduped") {
            // Deduped means an open identity already satisfied the template (carry or prior create).
            claimedDestinationSemantics.add(semantic);
            continue;
        }
        return {
            items,
            idempotent_noop: !mutated,
            degraded: `destination work not created for "${template.template_key}": ${created.error}`,
        };
    }

    return { items, idempotent_noop: !mutated };
}

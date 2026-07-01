/**
 * Canonical lifecycle visibility vs assignment-home predicates.
 * Visibility lenses do not require opportunities.work_unit_id = lifecycle_wu_*.
 */

import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import { ENROLLMENT_PIPELINE_WORK_UNIT_KEY } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import {
    isLifecycleStageWorkUnitKey,
    stageKeyFromLifecycleWorkUnitMetadata,
    type LifecycleStageWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { queueStatusKeysFromQueueConfig } from "@/lib/lifecycle/lifecycleQueueTrace";
import type { QueueConfig } from "@/lib/config/queueDefinitionSchema";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";

export type LifecycleVisibilityQueryMode =
    | "lifecycle_visibility"
    | "assignment_home"
    | "legacy_pipeline";

export type LifecycleVisibilitySiteContext = {
    locationIds?: readonly string[] | null;
    workspaceSiteId?: string | null;
};

export type LifecycleVisibilityAccessContext = {
    recordScopeConstraints?: RecordScopeConstraints | null;
};

export type ResolvedLifecycleVisibilityPredicate = {
    query_mode: LifecycleVisibilityQueryMode;
    org_id: string;
    department_id: string | null;
    lifecycle_process_id: string | null;
    stage_key: string | null;
    /** Lens anchor / default assignment home for this stage work unit. */
    work_unit_id: string;
    status_keys: string[];
    assignment_home_work_unit_id: string;
    /** When true, SQL must filter opportunities.work_unit_id (assignment / legacy container). */
    requires_work_unit_visibility_gate: boolean;
    lifecycle_builder_owned: boolean;
};

export function isLifecycleStageWorkUnitMetadata(metadata: unknown): boolean {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const m = metadata as LifecycleStageWorkUnitMetadata;
    return Boolean(
        m.lifecycle_builder_owned_v1?.builder_owned === true &&
            typeof m.lifecycle_stage_key === "string" &&
            m.lifecycle_stage_key.trim()
    );
}

/** Merged lifecycle status keys: explicit param → work_units.metadata → queue_definition filters. */
export function resolveLifecycleVisibilityStatusKeys(params: {
    workUnitMetadata?: unknown | null;
    queueDefinition?: unknown | null;
    statusKeys?: readonly string[];
}): string[] {
    const fromParam = (params.statusKeys ?? []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
    const fromMeta = statusKeysFromWorkUnitMetadata(params.workUnitMetadata);
    const fromQueue = statusKeysFromQueueDefinition(params.queueDefinition);
    return [...new Set([...fromParam, ...fromMeta, ...fromQueue])];
}

function statusKeysFromWorkUnitMetadata(metadata: unknown): string[] {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const keys = (metadata as LifecycleStageWorkUnitMetadata).status_keys;
    if (!Array.isArray(keys)) return [];
    return [...new Set(keys.map((k) => String(k ?? "").trim().toLowerCase()).filter(Boolean))];
}

function statusKeysFromQueueDefinition(queueDefinition: unknown): string[] {
    if (queueDefinition == null) return [];
    try {
        const bundle = loadQueueDefinitionBundle(queueDefinition);
        const keys: string[] = [];
        for (const q of bundle.def.queues) {
            keys.push(...queueStatusKeysFromQueueConfig(q as QueueConfig));
        }
        return [...new Set(keys.map((k) => k.trim().toLowerCase()).filter(Boolean))];
    } catch {
        return [];
    }
}

function resolveStageKey(params: {
    stageKey?: string | null;
    workUnitKey?: string | null;
    workUnitMetadata?: unknown | null;
}): string | null {
    const explicit = params.stageKey?.trim();
    if (explicit) return explicit;
    const fromMeta = stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata);
    if (fromMeta) return fromMeta;
    const key = (params.workUnitKey ?? "").trim().toLowerCase();
    if (key.startsWith("lifecycle_wu_")) {
        return key.slice("lifecycle_wu_".length) || null;
    }
    return null;
}

function resolveLifecycleProcessId(
    workUnitMetadata: unknown | null,
    lifecycleProcessId?: string | null
): string | null {
    const explicit = lifecycleProcessId?.trim();
    if (explicit) return explicit;
    if (workUnitMetadata == null || typeof workUnitMetadata !== "object" || Array.isArray(workUnitMetadata)) {
        return null;
    }
    const pid = (workUnitMetadata as LifecycleStageWorkUnitMetadata).lifecycle_process_id;
    return typeof pid === "string" && pid.trim() ? pid.trim() : null;
}

/**
 * Resolves how opportunity queue queries should scope rows for a work unit surface.
 * Lifecycle Builder stage work units use status-based visibility (no work_unit_id gate).
 */
export function resolveLifecycleVisibilityPredicate(params: {
    orgId: string;
    departmentId?: string | null;
    departmentMetadata?: unknown | null;
    lifecycleProcessId?: string | null;
    stageKey?: string | null;
    workUnitId: string;
    workUnitKey?: string | null;
    workUnitMetadata?: unknown | null;
    queueDefinition?: unknown | null;
    statusKeys?: readonly string[];
    siteContext?: LifecycleVisibilitySiteContext;
    accessContext?: LifecycleVisibilityAccessContext;
}): ResolvedLifecycleVisibilityPredicate {
    const org_id = params.orgId.trim();
    const work_unit_id = params.workUnitId.trim();
    const department_id = params.departmentId?.trim() || null;
    const key = (params.workUnitKey ?? "").trim().toLowerCase();
    const lifecycleMeta = isLifecycleStageWorkUnitMetadata(params.workUnitMetadata);
    const stage_key = resolveStageKey({
        stageKey: params.stageKey,
        workUnitKey: params.workUnitKey,
        workUnitMetadata: params.workUnitMetadata,
    });
    const lifecycle_process_id = resolveLifecycleProcessId(
        params.workUnitMetadata,
        params.lifecycleProcessId
    );

    const status_keys = resolveLifecycleVisibilityStatusKeys(params);

    if (key === ENROLLMENT_PIPELINE_WORK_UNIT_KEY) {
        return {
            query_mode: "legacy_pipeline",
            org_id,
            department_id,
            lifecycle_process_id,
            stage_key,
            work_unit_id,
            status_keys,
            assignment_home_work_unit_id: work_unit_id,
            requires_work_unit_visibility_gate: true,
            lifecycle_builder_owned: false,
        };
    }

    if (isLifecycleStageWorkUnitKey(key) || lifecycleMeta) {
        return {
            query_mode: "lifecycle_visibility",
            org_id,
            department_id,
            lifecycle_process_id,
            stage_key,
            work_unit_id,
            status_keys,
            assignment_home_work_unit_id: work_unit_id,
            requires_work_unit_visibility_gate: false,
            lifecycle_builder_owned: true,
        };
    }

    return {
        query_mode: "assignment_home",
        org_id,
        department_id,
        lifecycle_process_id,
        stage_key,
        work_unit_id,
        status_keys,
        assignment_home_work_unit_id: work_unit_id,
        requires_work_unit_visibility_gate: true,
        lifecycle_builder_owned: false,
    };
}

/** Map visibility predicate to legacy queue scope shape used by QueueService. */
export function lifecycleOpportunityScopeFromVisibilityPredicate(
    predicate: ResolvedLifecycleVisibilityPredicate
):
    | { mode: "work_unit_id"; workUnitId: string }
    | {
          mode: "lifecycle_visibility";
          departmentId: string;
          lifecycleWorkUnitId: string;
          stageKey: string;
      } {
    if (
        predicate.query_mode === "lifecycle_visibility" &&
        predicate.department_id &&
        predicate.stage_key
    ) {
        return {
            mode: "lifecycle_visibility",
            departmentId: predicate.department_id,
            lifecycleWorkUnitId: predicate.work_unit_id,
            stageKey: predicate.stage_key,
        };
    }
    return { mode: "work_unit_id", workUnitId: predicate.work_unit_id };
}

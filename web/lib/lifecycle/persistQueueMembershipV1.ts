/**
 * Persist queue_membership_v1 on Lifecycle Builder stage save — metadata only.
 * Does not change executable queue filters unless builder routing flag is on elsewhere.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import {
    QUEUE_MEMBERSHIP_METADATA_KEY,
    applyEnrollmentQueueMembershipSeedToWorkUnitMetadata,
    membershipSeedDecision,
    type QueueMembershipSeedStageActionKind,
} from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";

export type QueueMembershipPersistenceResult = {
    metadata: Record<string, unknown>;
    membership: QueueMembershipV1 | null;
    stageAction: QueueMembershipSeedStageActionKind;
    builderStageUpdated: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function findEnrollmentStageRaw(
    metadata: Record<string, unknown>,
    stageKey: string,
): Record<string, unknown> | null {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    if (!process || process.key !== ENROLLMENT_PROCESS_KEY) return null;
    const stage = process.stages.find((s) => s.key === stageKey.trim() && s.is_active);
    if (!stage) return null;
    return stage as unknown as Record<string, unknown>;
}

function applyMembershipToBuilderStage(
    metadata: Record<string, unknown>,
    stageKey: string,
    membership: QueueMembershipV1,
): Record<string, unknown> {
    const out = structuredClone(metadata) as Record<string, unknown>;
    const builderRaw = out[LIFECYCLE_BUILDER_METADATA_KEY];
    if (!isRecord(builderRaw) || !Array.isArray(builderRaw.processes)) return out;

    for (let pi = 0; pi < builderRaw.processes.length; pi++) {
        const processRaw = builderRaw.processes[pi];
        if (!isRecord(processRaw) || String(processRaw.key ?? "").trim() !== ENROLLMENT_PROCESS_KEY) continue;
        if (!Array.isArray(processRaw.stages)) continue;

        for (let si = 0; si < processRaw.stages.length; si++) {
            const stageRaw = processRaw.stages[si];
            if (!isRecord(stageRaw) || String(stageRaw.key ?? "").trim() !== stageKey.trim()) continue;
            stageRaw[QUEUE_MEMBERSHIP_METADATA_KEY] = structuredClone(membership);
            processRaw.stages[si] = stageRaw;
            builderRaw.processes[pi] = processRaw;
            out[LIFECYCLE_BUILDER_METADATA_KEY] = builderRaw;
            return out;
        }
    }

    return out;
}

/** Membership to denormalize on work unit — preserve explicit WU metadata when valid. */
export function resolveMembershipForWorkUnitDenormalization(
    stageKey: string,
    stageMembership: QueueMembershipV1 | null,
    existingWorkUnitMetadata: unknown,
): QueueMembershipV1 | null {
    const wuDecision = membershipSeedDecision(stageKey, existingWorkUnitMetadata);
    if (wuDecision.action === "skipped_has_explicit" && wuDecision.membership_before) {
        return wuDecision.membership_before;
    }
    return stageMembership;
}

/** Add inert membership metadata on queue_definition — does not change filters. */
export function mergeInertQueueMembershipIntoQueueDefinition(
    queueDefinition: unknown,
    membership: QueueMembershipV1 | null,
): Record<string, unknown> {
    const raw =
        queueDefinition != null && typeof queueDefinition === "object" && !Array.isArray(queueDefinition)
            ? (structuredClone(queueDefinition) as Record<string, unknown>)
            : { version: 2, entity_type: "opportunity", queues: [] };

    if (!membership) return raw;

    const inert: Record<string, unknown> = {
        queue_membership_v1: structuredClone(membership),
        subject_type: membership.subject_type,
        count_unit: membership.count_unit,
    };

    const rootMeta =
        raw.metadata != null && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
            ? (raw.metadata as Record<string, unknown>)
            : {};
    raw.metadata = { ...rootMeta, ...inert };

    if (Array.isArray(raw.queues)) {
        raw.queues = raw.queues.map((q) => {
            if (q == null || typeof q !== "object" || Array.isArray(q)) return q;
            const queue = q as Record<string, unknown>;
            const qMeta =
                queue.metadata != null && typeof queue.metadata === "object" && !Array.isArray(queue.metadata)
                    ? (queue.metadata as Record<string, unknown>)
                    : {};
            return { ...queue, metadata: { ...qMeta, ...inert } };
        });
    }

    return raw;
}

/**
 * Ensure builder stage carries queue_membership_v1 (preserve explicit or seed default).
 * Updates department metadata in DB when a default is written.
 */
export async function persistQueueMembershipForLifecycleStageSave(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        departmentId: string;
        stageKey: string;
        metadata: Record<string, unknown>;
    },
): Promise<QueueMembershipPersistenceResult> {
    const stageKey = params.stageKey.trim();
    const stageRaw = findEnrollmentStageRaw(params.metadata, stageKey);
    const decision = membershipSeedDecision(stageKey, stageRaw ?? {});

    let metadata = params.metadata;
    let builderStageUpdated = false;
    let membership: QueueMembershipV1 | null = null;

    if (decision.action === "seeded" && decision.membership) {
        membership = decision.membership;
        metadata = applyMembershipToBuilderStage(metadata, stageKey, membership);
        builderStageUpdated = true;
    } else if (decision.action === "skipped_has_explicit" && decision.membership_before) {
        membership = decision.membership_before;
    }

    if (builderStageUpdated) {
        const { error } = await supabase
            .from("departments")
            .update({ metadata, updated_at: new Date().toISOString() })
            .eq("id", params.departmentId)
            .eq("org_id", params.orgId);
        if (error) throw new Error(error.message);
    }

    return {
        metadata,
        membership,
        stageAction: decision.action,
        builderStageUpdated,
    };
}

export function mergeLifecycleStageWorkUnitMetadataWithMembership(
    stageKey: string,
    opts?: {
        processId?: string;
        statusKeys?: readonly string[];
        stageLabel?: string;
        queueMembership?: QueueMembershipV1 | null;
    },
    existingMetadata?: unknown,
): Record<string, unknown> {
    const membership = opts?.queueMembership ?? null;
    const base =
        existingMetadata != null && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
            ? (structuredClone(existingMetadata) as Record<string, unknown>)
            : {};

    base.lifecycle_builder_owned_v1 = { builder_owned: true };
    base.lifecycle_stage_key = stageKey.trim();
    if (opts?.stageLabel?.trim()) base.lifecycle_stage_label = opts.stageLabel.trim();
    if (opts?.processId) base.lifecycle_process_id = opts.processId;
    if (opts?.statusKeys?.length) base.status_keys = [...opts.statusKeys];

    if (membership) {
        return applyEnrollmentQueueMembershipSeedToWorkUnitMetadata(base, membership);
    }

    return base;
}

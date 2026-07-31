/**
 * Queue-membership denormalization onto the executable work-unit queue.
 *
 * The builder-stage writer that lived here — `persistQueueMembershipForLifecycleStageSave` — is
 * gone. It did two things that must not be one thing: it authored `queue_membership_v1` on the
 * stage, and when the key was absent it **seeded a template default and persisted it**, so merely
 * opening and saving a stage wrote configuration the operator never authored (decision D1).
 *
 * Authoring is now `applyQueueMembershipDraft` (explicit input only), and the compatibility read
 * that keeps queue runtime unchanged is `resolveEffectiveStageMembership` in the stage save. What
 * remains here is only the work-unit projection.
 */

import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";
import {
    applyEnrollmentQueueMembershipSeedToWorkUnitMetadata,
    membershipSeedDecision,
} from "@/lib/lifecycle/seedEnrollmentQueueMembershipV1";

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

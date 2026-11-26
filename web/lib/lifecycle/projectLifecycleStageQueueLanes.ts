/**
 * Pure projection of the queue_definition a stage save WOULD write, without writing it.
 *
 * Why this exists: perspectives are coerced to the stage's queue lanes, and the lanes were only
 * knowable by reading back the work unit the save had just upserted. That single read-after-write
 * is what made `saveLifecycleStageRuntimeConfig` impossible to migrate one call site at a time —
 * a builder key (`perspectives_v1`) depended on the result of a separate-table write.
 *
 * The dependency is not real. `upsertLifecycleStageWorkUnitForDepartment` builds its
 * queue_definition from pure functions over inputs the caller already holds, so the same functions
 * applied to the already-read work-unit row yield the same lanes with zero writes.
 *
 * This module must stay in lockstep with the upsert's queue_definition construction
 * (lifecycleStageWorkUnitIdentity.ts:485-522). `stageSaveDraftPersistence.test.ts` asserts the
 * projection equals what the upsert actually stores, so the two cannot drift silently.
 */

import { deriveQueueKeysFromQueueDefinition } from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
import {
    applyStatusKeysToLifecycleStageQueueDefinition,
    buildLifecycleStageQueueDefinition,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { mergeInertQueueMembershipIntoQueueDefinition } from "@/lib/lifecycle/persistQueueMembershipV1";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

export type LifecycleStageQueueProjectionInput = {
    stageKey: string;
    /** Display name the upsert would use — stage label, explicit name, or the stage default. */
    displayName: string;
    /** Status keys that become the queue's executable filters. */
    statusFilterKeys: readonly string[];
    /** The work unit's current queue_definition, or null when the row does not exist yet. */
    existingQueueDefinition: unknown | null;
    /** Membership denormalized onto the definition as inert metadata. */
    membership: QueueMembershipV1 | null;
};

/** The queue_definition the work-unit upsert would persist for these inputs. */
export function projectLifecycleStageQueueDefinition(
    input: LifecycleStageQueueProjectionInput,
): Record<string, unknown> {
    const stageKey = input.stageKey.trim();
    const base =
        input.existingQueueDefinition == null
            ? buildLifecycleStageQueueDefinition({
                  stageKey,
                  label: input.displayName,
                  statusKeys: input.statusFilterKeys,
              })
            : applyStatusKeysToLifecycleStageQueueDefinition(
                  input.existingQueueDefinition,
                  input.statusFilterKeys,
                  stageKey,
              );
    return mergeInertQueueMembershipIntoQueueDefinition(base, input.membership);
}

/** Lane keys perspectives may reference, excluding the aggregate lanes. */
export function projectLifecycleStageQueueLaneKeys(
    input: LifecycleStageQueueProjectionInput,
): string[] {
    return deriveQueueKeysFromQueueDefinition(projectLifecycleStageQueueDefinition(input));
}

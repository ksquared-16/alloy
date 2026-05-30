import type { QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";

/** Normalize stored work-unit queue_definition (v1 or v2) for drawer lifecycle rail + timeline. */
export function resolveWorkUnitQueueDefinitionForDrawer(raw: unknown): QueueDefinitionV1 | null {
    const bundle = tryLoadWorkUnitQueueDefinitionBundle(raw);
    return bundle?.def ?? null;
}

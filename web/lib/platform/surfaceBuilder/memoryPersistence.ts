/**
 * In-memory persistence adapter — preview / tests only. Does NOT persist to any store.
 *
 * Real surfaces inject their own adapter (Operational Intelligence → metric_placements;
 * Focus Panel → entity_layouts). This exists so the platform builder and consumer
 * definitions are exercisable before those adapters are wired.
 */

import type { SurfaceDoc, SurfacePersistenceAdapter } from "@/lib/platform/surfaceBuilder/surfaceDefinition";

export function createMemoryPersistence(initial: SurfaceDoc): SurfacePersistenceAdapter & { snapshot: () => SurfaceDoc } {
    let doc: SurfaceDoc = initial;
    return {
        load: async () => doc,
        persist: async (next: SurfaceDoc) => {
            doc = next;
        },
        snapshot: () => doc,
    };
}

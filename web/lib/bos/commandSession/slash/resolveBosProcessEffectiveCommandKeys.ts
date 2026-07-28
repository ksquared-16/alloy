/**
 * Resolve process-effective Command keys for BOS process-aware filtering (P6.S2).
 *
 * BOS still invokes through Command Runtime. This helper only constrains discovery.
 */

import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import { projectProcessRuntimeCommands } from "@/lib/lifecycle/processRuntimeCommandProjection";

export function resolveBosProcessEffectiveCommandKeys(input: {
    process: LifecycleBuilderProcessRecord;
    stageKey?: string | null;
    stageActionCatalog?: StageActionCatalogV1 | null;
    /** When true, only runnable selected Commands. Default: all selected enabled. */
    runnableOnly?: boolean;
}): ReadonlySet<string> {
    const projection = projectProcessRuntimeCommands({
        process: input.process,
        stageKey: input.stageKey,
        stageActionCatalog: input.stageActionCatalog,
    });
    if (input.runnableOnly) {
        return new Set(projection.runnableKeys);
    }
    return projection.selectedEnabledKeys;
}

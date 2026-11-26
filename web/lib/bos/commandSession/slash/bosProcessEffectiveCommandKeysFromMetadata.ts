/**
 * Client helper — resolve process-effective Command keys for BOS from a department builder.
 */

import {
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveBosProcessEffectiveCommandKeys } from "@/lib/bos/commandSession/slash/resolveBosProcessEffectiveCommandKeys";

export function pickActiveLifecycleProcess(
    processes: readonly LifecycleBuilderProcessRecord[],
    activeProcessId: string | null | undefined
): LifecycleBuilderProcessRecord | null {
    const want = (activeProcessId ?? "").trim();
    return (
        (want ? processes.find((p) => p.id === want && p.is_active) : null) ??
        processes.find((p) => p.is_active) ??
        null
    );
}

/** Pure — from department metadata already loaded. */
export function bosProcessEffectiveCommandKeysFromDepartmentMetadata(
    metadata: unknown,
    opts?: { runnableOnly?: boolean; stageKey?: string | null }
): {
    process: LifecycleBuilderProcessRecord | null;
    keys: ReadonlySet<string> | null;
} {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
    if (!builder) return { process: null, keys: null };
    const process = pickActiveLifecycleProcess(builder.processes, builder.active_process_id);
    if (!process) return { process: null, keys: null };
    return {
        process,
        keys: resolveBosProcessEffectiveCommandKeys({
            process,
            stageKey: opts?.stageKey,
            runnableOnly: opts?.runnableOnly,
        }),
    };
}

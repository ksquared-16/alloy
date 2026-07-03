/**
 * Presentation Runtime V2 — WS.PROCESS_GRID: the Workspace Process Surface.
 *
 * The runtime repeats ONE ProcessSummaryCard template across the configured business
 * processes (wider cards, two-up on desktop). This is the entire workspace surface body —
 * there is no separate header metric strip.
 */

import type { ProcessTileModel } from "@/lib/presentation/runtime";
import type { WorkspaceProcessSurfaceConfig } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { ProcessSummaryCard } from "./ProcessSummaryCard";

export function ProcessGrid({
    processes,
    config,
}: {
    processes: ProcessTileModel[];
    config: WorkspaceProcessSurfaceConfig;
}) {
    if (!processes.length) {
        return (
            <div
                {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processGrid)}
                className="max-w-[22rem] rounded-lg border border-alloy-stone/18 bg-white px-3 py-3 text-sm text-alloy-midnight/70"
            >
                No active business processes are configured for your workspace access yet.
            </div>
        );
    }
    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processGrid)}
            className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3"
        >
            {processes.map((process) => (
                <ProcessSummaryCard key={process.id} process={process} config={config} />
            ))}
        </div>
    );
}

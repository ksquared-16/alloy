/**
 * Presentation Runtime V2 — WS.PROCESS_GRID: responsive grid of process tiles
 * (each tile is the collapsed state of one process).
 */

import type { ProcessTileModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { ProcessTile } from "./ProcessTile";

export function ProcessGrid({ processes }: { processes: ProcessTileModel[] }) {
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
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
            {processes.map((process) => (
                <ProcessTile key={process.id} process={process} />
            ))}
        </div>
    );
}

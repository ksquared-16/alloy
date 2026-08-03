/**
 * Process usage for a Command — which Business Processes select it (P8).
 * Uses process command selection authority only (no V1∪legacy invent).
 */

import {
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderProcessRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { isCapabilityInProcessSelection } from "@/lib/lifecycle/ensureProcessCommandSetV1OnSave";
import { resolveBusinessProcessCommandSelection } from "@/lib/lifecycle/resolveBusinessProcessCommandSelection";

export type ProcessCommandUsageRow = {
    departmentId: string;
    departmentName: string;
    processId: string;
    processKey: string;
    processName: string;
    authority: "command_set_v1" | "legacy_compatibility";
    selected: boolean;
};

export function listProcessCommandUsage(input: {
    capabilityKey: string;
    departments: readonly {
        id: string;
        name: string;
        metadata?: unknown;
    }[];
}): ProcessCommandUsageRow[] {
    const want = input.capabilityKey.trim();
    if (!want) return [];

    const rows: ProcessCommandUsageRow[] = [];
    for (const dept of input.departments) {
        const builder = lifecycleBuilderFromDepartmentMetadata(dept.metadata);
        if (!builder) continue;
        for (const process of builder.processes) {
            if (!process.is_active) continue;
            if (!isCapabilityInProcessSelection(process, want)) continue;
            const selection = resolveBusinessProcessCommandSelection({ process });
            rows.push({
                departmentId: dept.id,
                departmentName: dept.name,
                processId: process.id,
                processKey: process.key,
                processName: process.name,
                authority: selection.authority,
                selected: true,
            });
        }
    }

    rows.sort((a, b) => {
        const d = a.departmentName.localeCompare(b.departmentName);
        if (d !== 0) return d;
        return a.processName.localeCompare(b.processName);
    });
    return rows;
}

/** Test helper — usage against an explicit process list. */
export function listProcessCommandUsageForProcesses(input: {
    capabilityKey: string;
    departmentId?: string;
    departmentName?: string;
    processes: readonly LifecycleBuilderProcessRecord[];
}): ProcessCommandUsageRow[] {
    return listProcessCommandUsage({
        capabilityKey: input.capabilityKey,
        departments: [
            {
                id: input.departmentId ?? "dept",
                name: input.departmentName ?? "Department",
                metadata: {
                    lifecycle_builder_v1: {
                        version: 1,
                        active_process_id: input.processes[0]?.id ?? null,
                        processes: input.processes,
                    },
                },
            },
        ],
    });
}

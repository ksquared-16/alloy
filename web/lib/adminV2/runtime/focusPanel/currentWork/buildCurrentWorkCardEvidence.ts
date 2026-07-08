/**
 * Current Work card evidence (Work archetype).
 *
 * Operational question: "What needs to happen next on this record?"
 *
 * Derives from `projectCurrentWork(context)` — the Operational Context adapter
 * supplies `stageWorkRuntime` + `signals.work`. No drawer VM, no card-local fetch.
 *
 * @see docs/platform/operator/current-work-surface.md
 */

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

import { inferWorkItemOwner } from "./inferWorkItemOwner";
import { projectCurrentWork, type CurrentWorkViewModel } from "./projectCurrentWork";

export type { WorkItemOwner } from "./inferWorkItemOwner";
export { inferWorkItemOwner };

export type CurrentWorkStatusTone = "due" | "blocked" | "ready" | "neutral";

export type CurrentWorkCardEvidence = {
    viewModel: CurrentWorkViewModel;
    primary: CurrentWorkViewModel["primaryWorkItem"];
    openCount: number;
    overdueCount: number;
    nextActionLabel: string | null;
    answerLine: string;
    supportingLine: string | null;
    statusChip: string | null;
    statusTone: CurrentWorkStatusTone;
    isEmpty: boolean;
    hasOverdue: boolean;
};

function statusFromViewModel(vm: CurrentWorkViewModel): {
    statusChip: string | null;
    statusTone: CurrentWorkStatusTone;
} {
    if (vm.isEmpty) {
        return { statusChip: null, statusTone: "neutral" };
    }
    if (vm.hasOverdue) {
        return {
            statusChip: vm.openCount === 1 ? "Overdue" : `${vm.openCount} overdue`,
            statusTone: "blocked",
        };
    }
    if (vm.blockers.length > 0) {
        return {
            statusChip: vm.blockers.length === 1 ? "Blocked" : `${vm.blockers.length} blockers`,
            statusTone: "blocked",
        };
    }
    if (vm.progressLabel) {
        return { statusChip: vm.progressLabel, statusTone: "due" };
    }
    if (vm.openCount > 0) {
        return { statusChip: `${vm.openCount} open`, statusTone: "neutral" };
    }
    return { statusChip: null, statusTone: "neutral" };
}

export function buildCurrentWorkCardEvidence(context: OperationalContext): CurrentWorkCardEvidence {
    const vm = projectCurrentWork(context);
    const { statusChip, statusTone } = statusFromViewModel(vm);

    if (vm.isEmpty) {
        return {
            viewModel: vm,
            primary: null,
            openCount: 0,
            overdueCount: 0,
            nextActionLabel: null,
            answerLine: "No current work configured",
            supportingLine: "Stage work is not configured for this record",
            statusChip,
            statusTone,
            isEmpty: true,
            hasOverdue: false,
        };
    }

    const supportingParts: string[] = [];
    if (vm.purpose) supportingParts.push(vm.purpose);
    else if (vm.progressVerdict) supportingParts.push(vm.progressVerdict);
    const supportingLine = supportingParts.length > 0 ? supportingParts.join(" · ") : null;

    return {
        viewModel: vm,
        primary: vm.primaryWorkItem,
        openCount: vm.openCount,
        overdueCount: context.signals.work.overdueCount,
        nextActionLabel: vm.primaryActionLabel,
        answerLine: vm.title,
        supportingLine,
        statusChip,
        statusTone,
        isEmpty: false,
        hasOverdue: vm.hasOverdue,
    };
}

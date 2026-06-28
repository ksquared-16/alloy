/**
 * Current Work card evidence (Work archetype).
 *
 * Operational question: "What needs to happen next on this record?"
 *
 * Derives entirely from the Operational Context (`context.signals.work`), which the
 * adapter projects from the composed work runtime + open tasks. No drawer VM, no
 * card-local fetch. The single most-urgent item is the overview answer; expansion
 * is local UI over the already-projected item list.
 *
 * @see docs/platform/operator/card-archetypes.md (Work)
 */

import type {
    OperationalContext,
    OperationalWorkItem,
} from "@/lib/adminV2/runtime/operationalContext/types";

export type CurrentWorkStatusTone = "due" | "blocked" | "ready" | "neutral";

export type CurrentWorkCardEvidence = {
    primary: OperationalWorkItem | null;
    items: OperationalWorkItem[];
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

export function buildCurrentWorkCardEvidence(context: OperationalContext): CurrentWorkCardEvidence {
    const work = context.signals.work;
    const items = work.items;
    const primary = work.primary;
    const isEmpty = items.length === 0;
    const hasOverdue = work.overdueCount > 0;

    if (isEmpty) {
        return {
            primary: null,
            items,
            openCount: 0,
            overdueCount: 0,
            nextActionLabel: work.nextActionLabel,
            answerLine: work.nextActionLabel ?? "No open work",
            supportingLine: work.nextActionLabel
                ? "No tasks queued — next action available"
                : "Nothing needs action right now",
            statusChip: work.nextActionLabel ? null : "Clear",
            statusTone: "ready",
            isEmpty: true,
            hasOverdue: false,
        };
    }

    const answerLine = primary?.label ?? "Open work";

    const supportingParts: string[] = [];
    if (primary?.dueLabel) supportingParts.push(primary.dueLabel);
    if (work.openCount > 0) {
        supportingParts.push(`${work.openCount} open task${work.openCount === 1 ? "" : "s"}`);
    }
    const supportingLine = supportingParts.length > 0 ? supportingParts.join(" · ") : null;

    let statusChip: string | null = null;
    let statusTone: CurrentWorkStatusTone = "neutral";
    if (hasOverdue) {
        statusChip = work.overdueCount === 1 ? "Overdue" : `${work.overdueCount} overdue`;
        statusTone = "blocked";
    } else if (primary?.urgency === "today") {
        statusChip = work.openCount > 0 ? `${work.openCount} open` : "Due today";
        statusTone = "due";
    } else if (work.openCount > 0) {
        statusChip = `${work.openCount} open`;
        statusTone = "neutral";
    }

    return {
        primary,
        items,
        openCount: work.openCount,
        overdueCount: work.overdueCount,
        nextActionLabel: work.nextActionLabel,
        answerLine,
        supportingLine,
        statusChip,
        statusTone,
        isEmpty: false,
        hasOverdue,
    };
}

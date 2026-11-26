/**
 * Contextual activate affordance for identity collection rows.
 * Replaces generic "Details →" with the configured Linked field destination.
 */

import type { IdentityFieldCellVM, IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export type IdentityContextualActivateAction = {
    fieldRef: string;
    label: string;
    destination: FocusPanelCardKey | null;
};

const SCHEDULE_FIELD_RE = /schedule|start_date|desired_start|room|program/i;

function cellsFromRecord(record: IdentityRecordVM): IdentityFieldCellVM[] {
    const out: IdentityFieldCellVM[] = [];
    for (const row of [...record.summaryRows, ...record.contextFactRows, ...record.detailRows]) {
        for (const cell of row.cells) out.push(cell);
    }
    return out;
}

function labelForLinkedCell(cell: IdentityFieldCellVM): string {
    const dest = cell.linkDestination;
    if (dest === "scheduling" || SCHEDULE_FIELD_RE.test(cell.fieldRef)) return "Assignments →";
    if (dest === "household") return "View household →";
    if (dest === "children") return "View children →";
    if (dest === "communications") return "Contacts →";
    if (dest === "current_work") return "What's Next →";
    const fromLink = cell.linkLabel?.trim();
    if (fromLink && fromLink.toLowerCase() !== "open" && fromLink.toLowerCase() !== "details") {
        return fromLink.endsWith("→") ? fromLink : `${fromLink} →`;
    }
    const short = cell.label?.trim();
    if (short) return `${short} →`;
    return "Open →";
}

/**
 * Prefer a Linked schedule/placement field when present; otherwise the first Linked cell.
 * Returns null when no Linked navigation is configured (no generic Details fallback).
 */
export function resolveIdentityContextualActivateAction(
    record: IdentityRecordVM,
): IdentityContextualActivateAction | null {
    const linked = cellsFromRecord(record).filter((cell) => cell.linked && cell.fieldRef);
    if (!linked.length) return null;

    const preferred =
        linked.find((cell) => cell.linkDestination === "scheduling" || SCHEDULE_FIELD_RE.test(cell.fieldRef))
        ?? linked.find((cell) => cell.linkDestination === "household")
        ?? linked.find((cell) => cell.linkDestination === "communications")
        ?? linked[0]!;

    return {
        fieldRef: preferred.fieldRef,
        label: labelForLinkedCell(preferred),
        destination: preferred.linkDestination ?? null,
    };
}

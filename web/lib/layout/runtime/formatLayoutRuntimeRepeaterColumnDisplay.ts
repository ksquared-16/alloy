import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";
import {
    formatLayoutRuntimeOperatorDateIfRefKey,
} from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import { resolveLayoutRuntimeRepeaterFieldValue } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

/** Resolve one enrollment/related-list cell with operator date formatting. */
export function formatLayoutRuntimeRepeaterColumnDisplay(
    row: ProofRuntimeRecord,
    col: LayoutCollectionColumn,
): string {
    const r = resolveLayoutRuntimeRepeaterFieldValue(row, col.refKey, {
        renderHint: col.renderHint,
        template: col.template,
    });
    if (r.isPlaceholder) return "—";
    const raw = r.display ?? "—";
    if (raw === "—") return raw;
    return formatLayoutRuntimeOperatorDateIfRefKey(col.refKey, raw, col.renderHint);
}

/** Labeled enrollment meta segments — value when present, otherwise `{label} —`. */
export function formatLeadEnrollmentCardMetaLine(
    row: ProofRuntimeRecord,
    metaColumns: LayoutCollectionColumn[],
): string {
    return metaColumns
        .map((col) => {
            const display = formatLayoutRuntimeRepeaterColumnDisplay(row, col);
            return display !== "—" ? display : `${col.label} —`;
        })
        .join(" · ");
}

/** Connected children card meta — omit empty segments (no `{label} —` noise). */
export function formatPersonConnectedChildMetaLine(
    row: ProofRuntimeRecord,
    metaColumns: LayoutCollectionColumn[],
): string {
    return metaColumns
        .map((col) => formatLayoutRuntimeRepeaterColumnDisplay(row, col))
        .filter((part) => part !== "—" && part.trim().length > 0)
        .join(" · ");
}

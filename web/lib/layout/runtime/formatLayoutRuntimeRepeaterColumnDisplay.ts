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

export type LeadEnrollmentCardMetaSegment = {
    refKey: string;
    label: string;
    display: string;
    isPlaceholder: boolean;
    /** Short inline label prefix when value is present (e.g. "Start"). */
    prefixLabel?: string;
};

function enrollmentSegmentPrefixLabel(refKey: string, label: string): string | undefined {
    const normalized = refKey.toLowerCase();
    if (normalized.includes("program")) return undefined;
    if (normalized.includes("desired_start") || label.toLowerCase().includes("start")) return "Start";
    if (normalized.includes("schedule")) return undefined;
    if (normalized.includes("room") || label.toLowerCase().includes("classroom")) return undefined;
    if (normalized.includes("location")) return undefined;
    if (normalized.includes("status")) return undefined;
    return undefined;
}

/** Structured enrollment card metadata for two-line drawer presentation. */
export function buildLeadEnrollmentCardMetaPresentation(
    row: ProofRuntimeRecord,
    metaColumns: LayoutCollectionColumn[],
): { birthLine: string | null; segments: LeadEnrollmentCardMetaSegment[] } {
    const dobColumn = metaColumns.find((col) => col.refKey.toLowerCase().includes("dob"));
    const detailColumns = metaColumns.filter((col) => col !== dobColumn);

    let birthLine: string | null = null;
    if (dobColumn) {
        const dobDisplay = formatLayoutRuntimeRepeaterColumnDisplay(row, dobColumn);
        if (dobDisplay !== "—") {
            birthLine = dobDisplay.toLowerCase().startsWith("born ") ? dobDisplay : `Born ${dobDisplay}`;
        }
    }

    const segments = detailColumns.map((col) => {
        const display = formatLayoutRuntimeRepeaterColumnDisplay(row, col);
        const isPlaceholder = display === "—";
        return {
            refKey: col.refKey,
            label: col.label,
            display,
            isPlaceholder,
            prefixLabel: isPlaceholder ? undefined : enrollmentSegmentPrefixLabel(col.refKey, col.label),
        };
    });

    return { birthLine, segments };
}

/** Labeled enrollment meta segments — value when present, otherwise `{label} —`. */
export function formatLeadEnrollmentCardMetaLine(
    row: ProofRuntimeRecord,
    metaColumns: LayoutCollectionColumn[],
): string {
    const { birthLine, segments } = buildLeadEnrollmentCardMetaPresentation(row, metaColumns);
    const parts = [
        birthLine,
        ...segments.map((segment) =>
            segment.isPlaceholder ? `${segment.label} —` : segment.display,
        ),
    ].filter(Boolean);
    return parts.join(" · ");
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

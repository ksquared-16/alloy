import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";
import { formatLayoutRuntimeOperatorDateIfRefKey,
} from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import { formatLayoutRuntimeAgeRefKeyDisplay } from "@/lib/layout/runtime/formatLayoutRuntimeAgeDisplay";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";
import { resolveLayoutRuntimeRepeaterFieldValue } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";
import { resolveLayoutRuntimeFieldDisplayLabel } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldDisplayLabel";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

/** Resolve one enrollment/related-list cell with operator date formatting. */
export function formatLayoutRuntimeRepeaterColumnDisplay(
    row: ProofRuntimeRecord,
    col: LayoutCollectionColumn,
    options?: { anchorRecord?: ProofRuntimeRecord },
): string {
    const r = resolveLayoutRuntimeRepeaterFieldValue(row, col.refKey, {
        renderHint: col.renderHint,
        template: col.template,
    });
    if (r.isPlaceholder) {
        const ageOnly = formatLayoutRuntimeAgeRefKeyDisplay(col.refKey, row, col);
        if (ageOnly) return ageOnly;
        const fallback = resolveLayoutRuntimeFieldDisplayLabel({
            refKey: col.refKey,
            rawValue: "—",
            row,
            anchorRecord: options?.anchorRecord,
            renderHint: col.renderHint,
        });
        if (fallback && fallback !== "—") {
            return formatLayoutRuntimeOperatorDateIfRefKey(col.refKey, fallback, col.renderHint);
        }
        return "—";
    }
    let raw = r.display ?? "—";
    const ageDisplay = formatLayoutRuntimeAgeRefKeyDisplay(col.refKey, row, col);
    if (ageDisplay) return ageDisplay;
    if (raw !== "—") {
        raw = resolveLayoutRuntimeFieldDisplayLabel({
            refKey: col.refKey,
            rawValue: raw,
            row,
            anchorRecord: options?.anchorRecord,
            renderHint: col.renderHint,
        });
        const statusLabel = formatLayoutRuntimeStatusLabel(raw, { refKey: col.refKey, renderHint: col.renderHint });
        if (statusLabel) raw = statusLabel;
    }
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

function columnMatchesRefKey(refKey: string, needles: string[]): boolean {
    const normalized = refKey.toLowerCase();
    return needles.some((needle) => normalized.includes(needle));
}

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

/** Structured enrollment card metadata — multi-line drawer presentation. */
export function buildLeadEnrollmentCardMetaPresentation(
    row: ProofRuntimeRecord,
    metaColumns: LayoutCollectionColumn[],
): {
    birthLine: string | null;
    startLocationLine: string | null;
    segments: LeadEnrollmentCardMetaSegment[];
} {
    const dobColumn = metaColumns.find((col) => columnMatchesRefKey(col.refKey, ["dob", "dob_age"]));
    const startColumn = metaColumns.find((col) =>
        columnMatchesRefKey(col.refKey, ["desired_start", "start_date"]),
    );
    const locationColumn = metaColumns.find((col) => columnMatchesRefKey(col.refKey, ["location"]));
    const detailColumns = metaColumns.filter(
        (col) => col !== dobColumn && col !== startColumn && col !== locationColumn,
    );

    let birthLine: string | null = null;
    if (dobColumn) {
        const dobDisplay = formatLayoutRuntimeRepeaterColumnDisplay(row, dobColumn);
        if (dobDisplay !== "—") {
            birthLine = dobDisplay.toLowerCase().startsWith("born ") ? dobDisplay : `Born ${dobDisplay}`;
        }
    }

    const startDisplay = startColumn ? formatLayoutRuntimeRepeaterColumnDisplay(row, startColumn) : "—";
    const locationDisplay = locationColumn ? formatLayoutRuntimeRepeaterColumnDisplay(row, locationColumn) : "—";
    const startLocationParts = [
        startDisplay !== "—" ?
            startDisplay.toLowerCase().startsWith("start ") ?
                startDisplay
            :   `Start ${startDisplay}`
        :   null,
        locationDisplay !== "—" ? locationDisplay : null,
    ].filter(Boolean);
    const startLocationLine = startLocationParts.length > 0 ? startLocationParts.join(" • ") : null;

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

    return { birthLine, startLocationLine, segments };
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

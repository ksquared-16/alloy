/**
 * Compact related-list row line — honor configured columns + per-field display metadata.
 */

import type { LayoutCollectionColumn } from "@/lib/layout/layoutV2";
import {
    readLayoutEditorDisplayConfig,
    typographyIntentClass,
} from "@/lib/layout/layoutEditorDisplayConfig";
import {
    formatLayoutEditorFieldDateValue,
    layoutEditorStatusFormatClass,
    shouldShowLayoutEditorFieldLabel,
} from "@/lib/layout/runtime/applyLayoutEditorFieldDisplay";
import { formatLayoutRuntimeRepeaterColumnDisplay } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type CompactRowLineTier = "primary" | "secondary" | "tertiary";

const TIER_DEFAULT_CLASS: Record<CompactRowLineTier, string> = {
    primary: "text-xs font-medium text-alloy-midnight",
    secondary: "text-xs text-alloy-midnight/70",
    tertiary: "text-[10px] text-alloy-midnight/50",
};

function tierForRowIndex(rowIndex: number): CompactRowLineTier {
    if (rowIndex <= 0) return "primary";
    if (rowIndex === 1) return "secondary";
    return "tertiary";
}

function formatCompactColumnSegment(
    row: ProofRuntimeRecord,
    col: LayoutCollectionColumn,
): { text: string; className: string } | null {
    const displayConfig = readLayoutEditorDisplayConfig(col);
    const raw = formatLayoutRuntimeRepeaterColumnDisplay(row, col);
    if (!raw || raw === "—") return null;

    const formatted =
        col.renderHint === "date" || displayConfig.dateFormat ?
            formatLayoutEditorFieldDateValue(col.refKey, raw, col.renderHint, displayConfig.dateFormat)
        :   raw;

    const showLabel = shouldShowLayoutEditorFieldLabel(displayConfig);
    const label = showLabel ? col.label?.trim() : "";
    const text = label ? `${label}: ${formatted}` : formatted;
    const statusClass = layoutEditorStatusFormatClass(displayConfig, col.renderHint);
    const typography = typographyIntentClass(displayConfig.typographyIntent);
    const className = [statusClass, typography].filter(Boolean).join(" ") || "";

    return { text, className };
}

export function formatLayoutRuntimeCompactRowLine(
    row: ProofRuntimeRecord,
    columns: Array<LayoutCollectionColumn | undefined>,
    rowIndex: number,
): { segments: Array<{ text: string; className: string }>; lineClassName: string } {
    const tier = tierForRowIndex(rowIndex);
    const segments = columns
        .map((col) => (col ? formatCompactColumnSegment(row, col) : null))
        .filter((segment): segment is { text: string; className: string } => segment != null);

    const hasTypographyOverride = columns.some((col) => {
        if (!col) return false;
        return Boolean(readLayoutEditorDisplayConfig(col).typographyIntent);
    });

    return {
        segments,
        lineClassName: hasTypographyOverride ? "text-xs text-alloy-midnight" : TIER_DEFAULT_CLASS[tier],
    };
}

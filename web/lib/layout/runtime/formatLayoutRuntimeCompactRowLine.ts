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

export type CompactRowFieldSegment = {
    label: string | null;
    value: string;
    valueClassName: string;
};

const TIER_LINE_CLASS: Record<CompactRowLineTier, string> = {
    primary: "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-alloy-midnight",
    secondary: "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-alloy-midnight/70",
    tertiary: "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-alloy-midnight/50",
};

const TIER_VALUE_CLASS: Record<CompactRowLineTier, string> = {
    primary: "font-medium text-alloy-midnight",
    secondary: "text-alloy-midnight/75",
    tertiary: "text-alloy-midnight/60",
};

const TIER_LABEL_CLASS: Record<CompactRowLineTier, string> = {
    primary: "text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45",
    secondary: "text-[10px] font-medium text-alloy-midnight/40",
    tertiary: "text-[10px] text-alloy-midnight/35",
};

function tierForRowIndex(rowIndex: number): CompactRowLineTier {
    if (rowIndex <= 0) return "primary";
    if (rowIndex === 1) return "secondary";
    return "tertiary";
}

function formatCompactColumnSegment(
    row: ProofRuntimeRecord,
    col: LayoutCollectionColumn,
    tier: CompactRowLineTier,
): CompactRowFieldSegment | null {
    const displayConfig = readLayoutEditorDisplayConfig(col);
    const raw = formatLayoutRuntimeRepeaterColumnDisplay(row, col);
    if (!raw || raw === "—") return null;

    const formatted =
        col.renderHint === "date" || displayConfig.dateFormat ?
            formatLayoutEditorFieldDateValue(col.refKey, raw, col.renderHint, displayConfig.dateFormat)
        :   raw;

    const showLabel = shouldShowLayoutEditorFieldLabel(displayConfig);
    const label = showLabel ? col.label?.trim() || null : null;
    const statusClass = layoutEditorStatusFormatClass(displayConfig, col.renderHint);
    const typography = typographyIntentClass(displayConfig.typographyIntent);
    const valueClassName =
        [TIER_VALUE_CLASS[tier], statusClass, typography].filter(Boolean).join(" ") || TIER_VALUE_CLASS[tier];

    return { label, value: formatted, valueClassName };
}

export function formatLayoutRuntimeCompactRowLine(
    row: ProofRuntimeRecord,
    columns: Array<LayoutCollectionColumn | undefined>,
    rowIndex: number,
): { segments: CompactRowFieldSegment[]; lineClassName: string; labelClassName: string } {
    const tier = tierForRowIndex(rowIndex);
    const segments = columns
        .map((col) => (col ? formatCompactColumnSegment(row, col, tier) : null))
        .filter((segment): segment is CompactRowFieldSegment => segment != null);

    return {
        segments,
        lineClassName: TIER_LINE_CLASS[tier],
        labelClassName: TIER_LABEL_CLASS[tier],
    };
}

/**
 * Related-list column width + label helpers (queue cards + drawer tables).
 */

import type { CSSProperties } from "react";
import type { LayoutCollectionColumn, LayoutColumnWidth, LayoutWidthBehavior } from "../layoutV2";

const GENERIC_COLUMN_LABELS = new Set([
    "column",
    "field",
    "value",
    "name",
    "label",
]);

/** True when a column label is a builder placeholder, not operator-configured copy. */
export function isGenericLayoutColumnLabel(label: string | undefined, refKey: string): boolean {
    const text = label?.trim();
    if (!text) return true;
    if (text === refKey) return true;
    return GENERIC_COLUMN_LABELS.has(text.toLowerCase());
}

/** Operator-facing column label for drawer table headers. */
export function layoutRepeaterColumnHeaderLabel(col: LayoutCollectionColumn): string {
    const label = col.label?.trim();
    if (label && !isGenericLayoutColumnLabel(label, col.refKey)) return label;
    const fromRef = col.refKey.split(".").pop()?.replace(/_/g, " ") ?? col.refKey;
    return fromRef.replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveWidthBehavior(col: LayoutCollectionColumn): LayoutColumnWidth | LayoutWidthBehavior {
    return col.widthBehavior ?? col.width ?? "medium";
}

function flexibleColumnShare(columns: LayoutCollectionColumn[]): string | null {
    const flexCount = columns.filter((col) => {
        const b = resolveWidthBehavior(col);
        return b === "flexible" || b === "equal";
    }).length;
    if (flexCount === 0) return null;
    return `${(100 / flexCount).toFixed(4)}%`;
}

/** Table cell width (drawer related_list). */
export function layoutRepeaterColumnWidthStyle(
    col: LayoutCollectionColumn,
    columns?: LayoutCollectionColumn[],
): CSSProperties {
    const b = resolveWidthBehavior(col);
    const flexShare =
        columns && (b === "flexible" || b === "equal") ? flexibleColumnShare(columns) : null;
    switch (b) {
        case "small":
            return { width: "1%", minWidth: 72, whiteSpace: "nowrap" };
        case "content":
            return { width: "1%", whiteSpace: "nowrap" };
        case "large":
            return { minWidth: 180, width: "24%" };
        case "flexible":
        case "equal":
            return flexShare ?
                    { width: flexShare, minWidth: 0 }
                :   { width: "auto", minWidth: 0 };
        case "medium":
        default:
            return { minWidth: 120, width: "16%" };
    }
}

/** CSS grid track for one repeater column (queue card rows). */
export function layoutRepeaterColumnGridTrack(col: LayoutCollectionColumn): string {
    const b = resolveWidthBehavior(col);
    switch (b) {
        case "small":
            return "max-content";
        case "content":
            return "max-content";
        case "large":
            return "minmax(120px, 1.6fr)";
        case "flexible":
        case "equal":
            return "minmax(0, 1fr)";
        case "medium":
        default:
            return "minmax(96px, 1fr)";
    }
}

export function layoutRepeaterRowGridStyle(columns: LayoutCollectionColumn[]): CSSProperties {
    if (columns.length === 0) return {};
    const gap =
        columns.some((col) => {
            const b = resolveWidthBehavior(col);
            return b === "large";
        }) ? "1.25rem"
        : columns.some((col) => {
                const b = resolveWidthBehavior(col);
                return b === "small" || b === "content";
            }) ? "0.625rem"
        :   "1rem";
    return {
        display: "grid",
        gridTemplateColumns: columns.map((col) => layoutRepeaterColumnGridTrack(col)).join(" "),
        columnGap: gap,
        rowGap: "0.25rem",
        width: "100%",
        alignItems: "center",
    };
}

export function layoutRepeaterRowGapClass(columns: LayoutCollectionColumn[]): string {
    const hasFlexible = columns.some((col) => {
        const b = resolveWidthBehavior(col);
        return b === "flexible" || b === "equal";
    });
    return hasFlexible ? "gap-x-4" : "gap-x-3";
}

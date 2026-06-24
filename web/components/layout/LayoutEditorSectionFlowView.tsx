"use client";

import { useMemo } from "react";
import type { LayoutSection } from "@/lib/layout/layoutV2";
import {
    segmentSectionsForRowLayout,
    sectionRowGroupGridStyle,
    sectionStackedRowCellStyle,
    sectionStackedRowGroupGridStyle,
    sectionStackedRowPrimaryStyle,
} from "@/lib/layout/layoutEditorSectionLayout";
import { cardWidthStackStyle } from "@/lib/layout/layoutBuilderCardWidth";
import {
    LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
    LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";

type Props = {
    sections: LayoutSection[];
    renderSection: (section: LayoutSection) => React.ReactNode;
    stackClassName?: string;
    rowClassName?: string;
    rowCellClassName?: string;
};

/**
 * Canonical peer-row cell base. Always applied so the equal-height alignment
 * contract cannot drift when a caller passes a custom `rowCellClassName`.
 */
const ROW_CELL_STRETCH_BASE = "min-w-0 flex h-full min-h-0 flex-col";

/** Merge caller classes onto the stretch base, de-duplicating tokens. */
function mergeRowCellClass(custom?: string): string {
    if (!custom) return ROW_CELL_STRETCH_BASE;
    const seen = new Set(ROW_CELL_STRETCH_BASE.split(/\s+/));
    const extra = custom.split(/\s+/).filter((token) => token && !seen.has(token));
    return extra.length ? `${ROW_CELL_STRETCH_BASE} ${extra.join(" ")}` : ROW_CELL_STRETCH_BASE;
}

/**
 * Renders sections vertically or in metadata-driven horizontal row groups.
 *
 * Shared by Builder preview and published runtime so both produce the same row
 * structure/classes. Peer sections in a `row`/`stacked_row` share top + bottom
 * edges via CSS grid + `items-stretch`; each cell stretches to the tallest
 * sibling. Do not fork this primitive per drawer.
 */
export default function LayoutEditorSectionFlowView({
    sections,
    renderSection,
    stackClassName,
    rowClassName = LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS,
    rowCellClassName = LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
}: Props) {
    const segments = useMemo(() => segmentSectionsForRowLayout(sections), [sections]);
    const cellClass = mergeRowCellClass(rowCellClassName);

    return (
        <>
            {segments.map((segment) => {
                if (segment.kind === "stack") {
                    const widthStyle = cardWidthStackStyle(segment.section);
                    return (
                        <div
                            key={segment.section.key}
                            className={stackClassName}
                            style={widthStyle}
                            data-layout-section-segment="stack"
                            data-layout-card-width-span={widthStyle ? String(segment.section.metadata?.layoutEditorSectionRowSpan) : undefined}
                        >
                            {renderSection(segment.section)}
                        </div>
                    );
                }
                if (segment.kind === "stacked_row") {
                    const gridStyle = sectionStackedRowGroupGridStyle(segment.layout);
                    const primaryStyle = sectionStackedRowPrimaryStyle(segment.layout);
                    return (
                        <div
                            key={segment.groupId}
                            className={`${rowClassName} items-stretch`}
                            style={{ ...gridStyle, alignItems: "stretch" }}
                            data-layout-section-row-group={segment.groupId}
                            data-layout-section-segment="stacked_row"
                            data-layout-section-stack-layout={segment.layout}
                            data-layout-section-row-aligned="true"
                        >
                            <div
                                className={cellClass}
                                style={primaryStyle}
                                data-layout-runtime-peer-row-card="true"
                                data-layout-runtime-stack-role="primary"
                            >
                                {renderSection(segment.primary)}
                            </div>
                            {segment.stacked.map((section, index) => (
                                <div
                                    key={section.key}
                                    className={cellClass}
                                    style={sectionStackedRowCellStyle(segment.layout, index as 0 | 1)}
                                    data-layout-runtime-peer-row-card="true"
                                    data-layout-runtime-stack-role="stack"
                                >
                                    {renderSection(section)}
                                </div>
                            ))}
                        </div>
                    );
                }
                if (segment.kind === "row") {
                    return (
                        <div
                            key={segment.groupId}
                            className={`${rowClassName} items-stretch`}
                            style={{ ...sectionRowGroupGridStyle(segment.spans), alignItems: "stretch" }}
                            data-layout-section-row-group={segment.groupId}
                            data-layout-section-segment="row"
                            data-layout-section-row-aligned="true"
                        >
                            {segment.sections.map((section) => (
                                <div
                                    key={section.key}
                                    className={cellClass}
                                    data-layout-runtime-peer-row-card="true"
                                >
                                    {renderSection(section)}
                                </div>
                            ))}
                        </div>
                    );
                }
                return null;
            })}
        </>
    );
}

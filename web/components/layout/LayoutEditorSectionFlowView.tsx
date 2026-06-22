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

type Props = {
    sections: LayoutSection[];
    renderSection: (section: LayoutSection) => React.ReactNode;
    stackClassName?: string;
    rowClassName?: string;
    rowCellClassName?: string;
};

/** Renders sections vertically or in metadata-driven horizontal row groups. */
export default function LayoutEditorSectionFlowView({
    sections,
    renderSection,
    stackClassName,
    rowClassName = "min-w-0",
    rowCellClassName = "min-w-0",
}: Props) {
    const segments = useMemo(() => segmentSectionsForRowLayout(sections), [sections]);

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
                            style={gridStyle}
                            data-layout-section-row-group={segment.groupId}
                            data-layout-section-segment="stacked_row"
                            data-layout-section-stack-layout={segment.layout}
                        >
                            <div
                                className={`${rowCellClassName} flex h-full min-h-0 flex-col`}
                                style={primaryStyle}
                                data-layout-runtime-peer-row-card="true"
                                data-layout-runtime-stack-role="primary"
                            >
                                {renderSection(segment.primary)}
                            </div>
                            {segment.stacked.map((section, index) => (
                                <div
                                    key={section.key}
                                    className={`${rowCellClassName} flex h-full min-h-0 flex-col`}
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
                            style={sectionRowGroupGridStyle(segment.spans)}
                            data-layout-section-row-group={segment.groupId}
                            data-layout-section-segment="row"
                        >
                            {segment.sections.map((section) => (
                                <div
                                    key={section.key}
                                    className={`${rowCellClassName} flex h-full min-h-0 flex-col`}
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

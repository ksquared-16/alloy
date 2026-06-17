"use client";

import { useMemo } from "react";
import type { LayoutSection } from "@/lib/layout/layoutV2";
import {
    segmentSectionsForRowLayout,
    sectionRowGroupGridStyle,
} from "@/lib/layout/layoutEditorSectionLayout";

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
                    return (
                        <div key={segment.section.key} className={stackClassName} data-layout-section-segment="stack">
                            {renderSection(segment.section)}
                        </div>
                    );
                }
                return (
                    <div
                        key={segment.groupId}
                        className={rowClassName}
                        style={sectionRowGroupGridStyle(segment.spans)}
                        data-layout-section-row-group={segment.groupId}
                        data-layout-section-segment="row"
                    >
                        {segment.sections.map((section) => (
                            <div key={section.key} className={rowCellClassName}>
                                {renderSection(section)}
                            </div>
                        ))}
                    </div>
                );
            })}
        </>
    );
}

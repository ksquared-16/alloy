"use client";

import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import type { AdornmentActionHandler, LayoutRuntimeSectionPresentation } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
    LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS,
    LAYOUT_RUNTIME_SECTION_STACK_CLASS,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";

type Props = {
    doc: LayoutDoc;
    sections: LayoutSection[];
    record: ProofRuntimeRecord;
    entityId: string;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
    sectionPresentation?: LayoutRuntimeSectionPresentation;
    stackClassName?: string;
    rowClassName?: string;
    rowCellClassName?: string;
};

/** Runtime renderer for layout-owned sections with optional horizontal row groups. */
export default function LayoutRuntimeSectionFlowView({
    doc,
    sections,
    record,
    entityId,
    canMutate,
    onAdornmentAction,
    sectionPresentation = "default",
    stackClassName,
    rowClassName = LAYOUT_RUNTIME_SECTION_ROW_GROUP_CLASS,
    rowCellClassName = LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
}: Props) {
    if (sections.length === 0) return null;

    const flowStackClass = stackClassName ?? LAYOUT_RUNTIME_SECTION_STACK_CLASS;

    return (
        <div className={flowStackClass} data-layout-runtime-section-flow="true">
            <LayoutEditorSectionFlowView
                sections={sections}
                rowClassName={rowClassName}
                rowCellClassName={rowCellClassName}
                renderSection={(section) => (
                    <LayoutRuntimeDrawerBodyView
                        doc={{ ...doc, sections: [section] }}
                        record={record}
                        entityId={entityId}
                        canMutate={canMutate}
                        onAdornmentAction={onAdornmentAction}
                        sectionPresentation={sectionPresentation}
                        useSectionFlow={false}
                    />
                )}
            />
        </div>
    );
}

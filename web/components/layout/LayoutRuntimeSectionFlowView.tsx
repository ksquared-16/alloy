"use client";

import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import type { AdornmentActionHandler, LayoutRuntimeSectionPresentation } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

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
    rowClassName = "min-w-0",
    rowCellClassName = "min-w-0",
}: Props) {
    if (sections.length === 0) return null;

    return (
        <LayoutEditorSectionFlowView
            sections={sections}
            stackClassName={stackClassName}
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
    );
}

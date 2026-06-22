"use client";

import { createPortal } from "react-dom";
import OpportunityDrawerLayoutFieldSettings from "@/components/adminV2/settings/OpportunityDrawerLayoutFieldSettings";
import type { LayoutEditorFieldNode } from "@/lib/layout/layoutEditorCompositionModel";
import type { LayoutEditorDisplayConfig } from "@/lib/layout/layoutEditorDisplayConfig";
import type { LayoutEditorVisibilityRule } from "@/lib/layout/layoutEditorVisibilityRules";

type FieldSettingsPatch = {
    label?: string;
    display?: LayoutEditorDisplayConfig;
    visibility?: LayoutEditorVisibilityRule;
    editable?: boolean;
};

type Props = {
    node: LayoutEditorFieldNode;
    onClose: () => void;
    onChange: (patch: FieldSettingsPatch) => void;
    testId?: string;
};

/** Canonical full-screen field settings — single editor for canvas and Properties. */
export default function OpportunityDrawerLayoutFieldSettingsModal({
    node,
    onClose,
    onChange,
    testId = "visual-editor-field-settings-modal",
}: Props) {
    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-alloy-midnight/40 p-4"
            data-testid={testId}
            onClick={onClose}
        >
            <div
                className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-alloy-stone/15 bg-white p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <OpportunityDrawerLayoutFieldSettings node={node} onClose={onClose} onChange={onChange} />
            </div>
        </div>,
        document.body,
    );
}

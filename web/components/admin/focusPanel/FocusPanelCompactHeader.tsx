"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import FocusPanelModeSwitch from "@/components/admin/focusPanel/FocusPanelModeSwitch";
import FocusPanelSubjectIdentityBlock from "@/components/admin/focusPanel/FocusPanelSubjectIdentityBlock";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelContextChip } from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";

export type FocusPanelCompactHeaderProps = {
    subjectTitle: string;
    contextChips: FocusPanelContextChip[];
    secondaryActions?: ReactNode | null;
    activeMode: FocusPanelMode;
    onModeChange: (mode: FocusPanelMode) => void;
    onClose: () => void;
};

/**
 * Compact Focus Panel header — branded subject identity block + BOS + Manage.
 * No stage-movement CTAs or unrestricted status mutation.
 */
export default function FocusPanelCompactHeader({
    subjectTitle,
    contextChips,
    secondaryActions,
    activeMode,
    onModeChange,
    onClose,
}: FocusPanelCompactHeaderProps) {
    return (
        <div className="alloy-os-fp-header-compact" data-alloy-os-focus-panel-header="true">
            <div className="alloy-os-fp-header-compact__band" data-focus-panel-tier="subject">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close Focus Panel"
                    className="alloy-os-fp-header-compact__close"
                    data-focus-panel-close="true"
                >
                    <X className="h-3.5 w-3.5" aria-hidden />
                </button>
                <FocusPanelSubjectIdentityBlock
                    subjectTitle={subjectTitle}
                    contextChips={contextChips}
                />
                <div
                    className="alloy-os-fp-header-compact__rail shrink-0"
                    data-alloy-os-fp-header-actions="true"
                >
                    {secondaryActions ?
                        <div className="alloy-os-fp-header-compact__actions alloy-os-fp-header-compact__secondary-actions">
                            {secondaryActions}
                        </div>
                    :   null}
                </div>
            </div>
            <div className="alloy-os-fp-header-compact__mode" data-focus-panel-tier="mode">
                <FocusPanelModeSwitch activeMode={activeMode} onModeChange={onModeChange} />
            </div>
        </div>
    );
}

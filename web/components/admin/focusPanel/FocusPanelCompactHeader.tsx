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
    /** Optional identity summary line (queue seed contact / attention / work). */
    identitySummaryLine?: string | null;
    secondaryActions?: ReactNode | null;
    activeMode: FocusPanelMode;
    onModeChange: (mode: FocusPanelMode) => void;
    onClose: () => void;
    /** Composer preview — runtime shell without dismiss control. */
    hideClose?: boolean;
    /**
     * The scoped person's identity, when the panel is operating on one. Passed straight through to
     * the identity block, which already owns the ONE avatar model (`CardAvatar`). The header
     * resolves nothing itself.
     */
    personSubjectName?: string | null;
    personSubjectImageUrl?: string | null;
    personSubjectRecordId?: string | null;
};

/**
 * Compact Focus Panel header — branded subject identity block + BOS + Manage.
 * No stage-movement CTAs or unrestricted status mutation.
 */
export default function FocusPanelCompactHeader({
    subjectTitle,
    contextChips,
    identitySummaryLine,
    secondaryActions,
    activeMode,
    onModeChange,
    onClose,
    hideClose = false,
    personSubjectName,
    personSubjectImageUrl,
    personSubjectRecordId,
}: FocusPanelCompactHeaderProps) {
    return (
        <div
            className={[
                "alloy-os-fp-header-compact",
                hideClose ? "alloy-os-fp-header-compact--no-close" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            data-alloy-os-focus-panel-header="true"
            data-focus-panel-close-hidden={hideClose ? "true" : undefined}
        >
            <div className="alloy-os-fp-header-compact__band" data-focus-panel-tier="subject">
                {hideClose ? null : (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close Focus Panel"
                        className="alloy-os-fp-header-compact__close"
                        data-focus-panel-close="true"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                )}
                <FocusPanelSubjectIdentityBlock
                    subjectTitle={subjectTitle}
                    contextChips={contextChips}
                    identitySummaryLine={identitySummaryLine}
                    personSubjectName={personSubjectName}
                    personSubjectImageUrl={personSubjectImageUrl}
                    personSubjectRecordId={personSubjectRecordId}
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

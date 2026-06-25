"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import FocusPanelModeSwitch from "@/components/admin/focusPanel/FocusPanelModeSwitch";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";

export type FocusPanelCompactHeaderProps = {
    subjectTitle: string;
    missionLine: string | null;
    stageLabel: string | null;
    statusChip: ReactNode;
    primaryAction?: ReactNode | null;
    secondaryActions?: ReactNode | null;
    activeMode: FocusPanelMode;
    onModeChange: (mode: FocusPanelMode) => void;
    onClose: () => void;
};

/**
 * Compact Focus Panel header (~65–70px subject band + mode control).
 * Subject · Mission · Stage · Status · Primary Action — no breadcrumbs.
 */
export default function FocusPanelCompactHeader({
    subjectTitle,
    missionLine,
    stageLabel,
    statusChip,
    primaryAction,
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
                <div className="alloy-os-fp-header-compact__identity min-w-0">
                    <div className="alloy-os-fp-header-compact__title-row">
                        <h2 id="admin-focus-panel-title" className="alloy-os-fp-header-compact__title">
                            {subjectTitle}
                        </h2>
                        {stageLabel ?
                            <span className="alloy-os-fp-header-compact__stage">{stageLabel}</span>
                        :   null}
                    </div>
                    {missionLine ?
                        <p className="alloy-os-fp-header-compact__mission" data-focus-panel-mission="true">
                            {missionLine}
                        </p>
                    :   null}
                </div>
                <div className="alloy-os-fp-header-compact__state shrink-0">{statusChip}</div>
                {primaryAction ?
                    <div className="alloy-os-fp-header-compact__primary shrink-0">{primaryAction}</div>
                :   null}
                {secondaryActions ?
                    <div className="alloy-os-fp-header-compact__actions shrink-0">{secondaryActions}</div>
                :   null}
            </div>
            <div className="alloy-os-fp-header-compact__mode" data-focus-panel-tier="mode">
                <FocusPanelModeSwitch activeMode={activeMode} onModeChange={onModeChange} />
            </div>
        </div>
    );
}

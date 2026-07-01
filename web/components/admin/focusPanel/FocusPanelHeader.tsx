"use client";

import type { ReactNode } from "react";

import FocusPanelModeSwitch from "@/components/admin/focusPanel/FocusPanelModeSwitch";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";

export type FocusPanelHeaderProps = {
    /** Chrome tier — breadcrumb + secondary actions + close. */
    chromeRow: ReactNode;
    /** Subject tier — avatar, identity, mission, state, primary action. */
    subjectRow: ReactNode;
    activeMode: FocusPanelMode;
    onModeChange: (mode: FocusPanelMode) => void;
    /** Optional queue prev/next under chrome. */
    queueNavigation?: ReactNode | null;
};

/**
 * Focus Panel fixed header — Chrome → Subject → Mode control (Concept B).
 * Body scrolls independently below this shell.
 */
export default function FocusPanelHeader({
    chromeRow,
    subjectRow,
    activeMode,
    onModeChange,
    queueNavigation,
}: FocusPanelHeaderProps) {
    return (
        <div className="alloy-os-focus-panel-header" data-alloy-os-focus-panel-header="true">
            <div className="alloy-os-focus-panel-header__chrome" data-focus-panel-tier="chrome">
                {chromeRow}
            </div>
            <div className="alloy-os-focus-panel-header__subject" data-focus-panel-tier="subject">
                {subjectRow}
            </div>
            {queueNavigation ?
                <div
                    className="alloy-os-focus-panel-header__queue-nav"
                    data-focus-panel-queue-navigation="true"
                >
                    {queueNavigation}
                </div>
            :   null}
            <div className="alloy-os-focus-panel-header__mode" data-focus-panel-tier="mode">
                <FocusPanelModeSwitch activeMode={activeMode} onModeChange={onModeChange} />
            </div>
        </div>
    );
}

"use client";

import clsx from "clsx";

import {
    FOCUS_PANEL_SWITCH_MODES,
    FOCUS_PANEL_MODE_LABELS,
    type FocusPanelMode,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";

type Props = {
    activeMode: FocusPanelMode;
    onModeChange: (mode: FocusPanelMode) => void;
};

/**
 * Two-mode switch: **Work** (Core Four operating surface) + **Activity**.
 * The legacy split "Work" view is merged into Work — the cards own
 * overview/evidence/focus/edit, so a third tab was duplicative.
 */
export default function FocusPanelModeSwitch({ activeMode, onModeChange }: Props) {
    return (
        <div
            className="alloy-os-focus-panel-mode-switch"
            role="tablist"
            aria-label="Focus Panel mode"
            data-focus-panel-mode-switch="true"
            data-alloy-os-focus-panel-mode-switch="true"
            {...alloySectionDomAttrs("WU-08")}
        >
            {FOCUS_PANEL_SWITCH_MODES.map((mode) => {
                // The legacy `work` mode collapses onto the Work tab (`summary`).
                const active = mode === activeMode || (mode === "summary" && activeMode === "work");
                return (
                    <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-controls={`focus-panel-mode-${mode}`}
                        id={`focus-panel-mode-tab-${mode}`}
                        className={clsx(
                            "alloy-os-focus-panel-mode-switch__tab",
                            active && "alloy-os-focus-panel-mode-switch__tab--active",
                        )}
                        data-focus-panel-mode={mode}
                        data-focus-panel-mode-selected={active ? "true" : undefined}
                        onClick={() => onModeChange(mode)}
                    >
                        {FOCUS_PANEL_MODE_LABELS[mode]}
                    </button>
                );
            })}
        </div>
    );
}

"use client";

import clsx from "clsx";

import {
    FOCUS_PANEL_MODES,
    FOCUS_PANEL_MODE_LABELS,
    type FocusPanelMode,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";

type Props = {
    activeMode: FocusPanelMode;
    onModeChange: (mode: FocusPanelMode) => void;
};

/** Integrated Summary / Work / Activity mode switch (Concept B). */
export default function FocusPanelModeSwitch({ activeMode, onModeChange }: Props) {
    return (
        <div
            className="alloy-os-focus-panel-mode-switch"
            role="tablist"
            aria-label="Focus Panel mode"
            data-focus-panel-mode-switch="true"
            data-alloy-os-focus-panel-mode-switch="true"
        >
            {FOCUS_PANEL_MODES.map((mode) => {
                const active = mode === activeMode;
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
                        onClick={() => onModeChange(mode)}
                    >
                        {FOCUS_PANEL_MODE_LABELS[mode]}
                    </button>
                );
            })}
        </div>
    );
}

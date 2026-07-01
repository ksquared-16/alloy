/**
 * Focus Panel mode vocabulary — canonical runtime replacement for drawer tabs.
 * Platform-owned; configuration will assign card composition per mode later.
 */

export const FOCUS_PANEL_MODES = ["summary", "work", "activity"] as const;
export type FocusPanelMode = (typeof FOCUS_PANEL_MODES)[number];

/**
 * Operator-facing mode labels. The `summary` mode IS the operating surface where
 * the Core Four live, so it reads as **Work** (the operator operates here). The
 * legacy `work` split-view mode is retained for compat but no longer surfaced as a
 * separate tab — it was duplicative with `summary`. The cards own
 * overview → evidence → focus → edit themselves, so there is no need for a third tab.
 */
export const FOCUS_PANEL_MODE_LABELS: Record<FocusPanelMode, string> = {
    summary: "Work",
    work: "Work",
    activity: "Activity",
};

/**
 * Modes shown in the mode switch. Temporary two-mode model: **Work** (the Core Four
 * operating surface, key `summary`) + **Activity** (timeline / comms / documents).
 * The legacy `work` split view is hidden — merged into Work.
 */
export const FOCUS_PANEL_SWITCH_MODES: readonly FocusPanelMode[] = ["summary", "activity"];

export function isFocusPanelMode(value: unknown): value is FocusPanelMode {
    return typeof value === "string" && (FOCUS_PANEL_MODES as readonly string[]).includes(value);
}

/** Session key — mode persists across record swaps within a work-unit session. */
export const FOCUS_PANEL_MODE_SESSION_KEY = "alloy:focus-panel-mode";

/** Map legacy drawer tab keys to Focus Panel modes (compatibility layer). */
export function drawerTabToFocusPanelMode(tab: string): FocusPanelMode {
    switch (tab) {
        case "overview":
            return "summary";
        case "communications":
        case "documents":
        case "notes":
        case "activity":
        case "related":
            return "activity";
        default:
            // Legacy split "work" view is merged into the Work surface (summary).
            return "summary";
    }
}

/** Map Focus Panel mode back to a representative drawer tab for prefetch / deep links. */
export function focusPanelModeToDrawerTab(mode: FocusPanelMode): string {
    switch (mode) {
        case "summary":
            return "overview";
        case "work":
            return "overview";
        case "activity":
            return "activity";
    }
}

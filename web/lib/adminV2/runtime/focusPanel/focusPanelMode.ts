/**
 * Focus Panel mode vocabulary — canonical runtime replacement for drawer tabs.
 * Platform-owned; configuration will assign card composition per mode later.
 */

export const FOCUS_PANEL_MODES = ["summary", "work", "activity"] as const;
export type FocusPanelMode = (typeof FOCUS_PANEL_MODES)[number];

export const FOCUS_PANEL_MODE_LABELS: Record<FocusPanelMode, string> = {
    summary: "Summary",
    work: "Work",
    activity: "Activity",
};

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
            return "work";
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

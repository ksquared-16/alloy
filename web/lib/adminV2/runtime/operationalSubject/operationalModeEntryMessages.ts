/** Alloy OS operational surface preparation copy (Work Unit entry). */
export const OPERATIONAL_MODE_ENTRY_MESSAGES = {
    preparingSurface: "Preparing operational surface…",
    resolvingNextWork: "Resolving next work…",
    openingFocusPanel: "Opening Focus Panel…",
} as const;

export type OperationalModeEntryPhase = "preparing" | "ready";

export function resolveOperationalModeEntryMessage(input: {
    queueItemsLoading: boolean;
    laneMayPaint: boolean;
    hasRows: boolean;
    routeRecordId: string | null;
    drawerOpen: boolean;
}): string {
    if (input.queueItemsLoading || !input.laneMayPaint) {
        return OPERATIONAL_MODE_ENTRY_MESSAGES.preparingSurface;
    }
    if (input.routeRecordId && !input.drawerOpen) {
        return OPERATIONAL_MODE_ENTRY_MESSAGES.openingFocusPanel;
    }
    if (input.hasRows && !input.drawerOpen) {
        return OPERATIONAL_MODE_ENTRY_MESSAGES.resolvingNextWork;
    }
    return OPERATIONAL_MODE_ENTRY_MESSAGES.preparingSurface;
}

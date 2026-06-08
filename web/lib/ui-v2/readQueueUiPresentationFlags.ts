/** Read optional v2 UI presentation flags from stored queue_definition JSON. */
export function readQueueUiPresentationFlags(raw: unknown): {
    suppressOtherPill: boolean;
    suppressLifecyclePanel: boolean;
    suppressActiveQueueDescription: boolean;
} {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { suppressOtherPill: false, suppressLifecyclePanel: false, suppressActiveQueueDescription: false };
    }
    const ui = (raw as { ui?: unknown }).ui;
    if (ui == null || typeof ui !== "object" || Array.isArray(ui)) {
        return { suppressOtherPill: false, suppressLifecyclePanel: false, suppressActiveQueueDescription: false };
    }
    const flags = ui as {
        suppress_other_pill?: unknown;
        suppress_lifecycle_panel?: unknown;
        suppress_active_queue_description?: unknown;
    };
    const suppressLifecyclePanel = flags.suppress_lifecycle_panel === true;
    return {
        suppressOtherPill: flags.suppress_other_pill === true,
        suppressLifecyclePanel,
        suppressActiveQueueDescription:
            flags.suppress_active_queue_description === true || suppressLifecyclePanel,
    };
}

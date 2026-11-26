/**
 * ONE SIGNAL THAT THE FAMILY'S ENROLLMENT MOVED.
 *
 * The payment and family panels each read their own server projection once, on mount. A family
 * that finished its paperwork (fees become due) or paid (fees become complete) kept seeing the
 * panel's first answer — "Enrollment fee — not due yet" under a paid fee — until a reload. Anything
 * that moves the journey announces it here; each panel re-reads its own server truth. Nothing is
 * computed in the browser.
 */

export const PARTICIPANT_PROGRESS_EVENT = "alloy:participant-progress";

export function announceParticipantProgress(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(PARTICIPANT_PROGRESS_EVENT));
}

/** Re-read on a progress announcement, and when the parent returns to the tab. Returns cleanup. */
export function onParticipantProgress(reload: () => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const onVisible = () => {
        if (document.visibilityState === "visible") reload();
    };
    window.addEventListener(PARTICIPANT_PROGRESS_EVENT, reload);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
        window.removeEventListener(PARTICIPANT_PROGRESS_EVENT, reload);
        document.removeEventListener("visibilitychange", onVisible);
    };
}

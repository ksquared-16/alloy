/**
 * Focus Panel subject-identity reveal decision.
 *
 * A queue-row click must switch the Focus Panel subject identity *immediately* from the clicked
 * row seed, before the drawer payload (cards/body) resolves. The displayed payload's subject
 * (`displayedSubjectId`, i.e. the rendered record id) lags the selected subject
 * (`selectedSubjectId`, i.e. `drawer.id`) in two windows:
 *
 *   - initial open: no payload yet (`hasDisplayVm` false) → subject pending
 *   - row → row switch: the prior subject's payload is held while the new one warms
 *     (`hasDisplayVm` true but `displayedSubjectId !== selectedSubjectId`) → subject pending
 *
 * While `subjectPending`, the Focus Panel header renders from the clicked-row seed (new identity)
 * and the body shows a clear pending state. When the payload for the selected subject resolves
 * (`subjectResolved`), the full payload-backed header + body render into the already-switched
 * shell. Latest click always wins because `selectedSubjectId` is `drawer.id`, which updates
 * synchronously on click.
 */
export type FocusPanelSubjectRevealInput = {
    /** Focus Panel shell is mounted for a selected opportunity subject. */
    shellOpen: boolean;
    /** A payload view-model is currently displayed (possibly for the prior subject). */
    hasDisplayVm: boolean;
    /** The selected subject id (`drawer.id`) — switches synchronously on row click. */
    selectedSubjectId: string | null;
    /** The subject id of the currently displayed payload (rendered `record.id`). */
    displayedSubjectId: string | null;
};

export type FocusPanelSubjectReveal = {
    /** Displayed payload matches the selected subject — render the full payload header + body. */
    subjectResolved: boolean;
    /** Subject identity has not caught up — render the seed header + pending body. */
    subjectPending: boolean;
};

export function resolveFocusPanelSubjectReveal(
    input: FocusPanelSubjectRevealInput,
): FocusPanelSubjectReveal {
    const subjectResolved =
        input.hasDisplayVm &&
        input.selectedSubjectId != null &&
        input.displayedSubjectId === input.selectedSubjectId;
    return {
        subjectResolved,
        subjectPending: input.shellOpen && !subjectResolved,
    };
}

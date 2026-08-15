/**
 * Escape belongs to the INNERMOST open layer.
 *
 * The Focus Panel grid dismisses card elevation on Escape from a **capture-phase** listener on
 * `window`. Capture was chosen deliberately, to beat the record drawer's own ESC-to-close so that
 * depth dismisses without closing the record — i.e. to win against an OUTER layer.
 *
 * The side effect is that it also wins against every INNER layer, because capture on `window` is
 * the earliest listener in the document. Measured on Firefly with three layers open — an
 * AlloySelect menu, an inline field edit, and the expanded Children card — a single Escape
 * collapsed all three: menu 1→0, editing 2→0, elevated true→false. The operator who opens a
 * dropdown and changes their mind loses the whole card and has to navigate back.
 *
 * This predicate is the yield condition: when a more-inner dismissible layer is open, the grid
 * declines the key and lets that layer close itself. One owner for the selector list, so a new
 * transient primitive is registered here rather than by adding another Escape listener.
 */

/**
 * Open transient popups. Both platform menus render `role="listbox"` (`AlloySelect`'s
 * `.alloy-select__list`, `AlloyTimeInput`'s `.alloy-time-input__list`) and are only in the DOM
 * while open; Radix menus (the Tour ▾ grouped actions) publish `data-state="open"`.
 */
export const TRANSIENT_POPUP_SELECTOR = '[role="listbox"], [role="menu"][data-state="open"]';

/**
 * An open inline field editor, which publishes `data-identity-editing` while editing — the marker
 * is explicit rather than inferred from the control, because the control differs per field kind
 * (text input, date input, `AlloySelect`).
 *
 * It counts only when it also holds focus: Escape is handled by the editor's own `onKeyDown`, which
 * cannot run unless focus is inside it, and yielding to a layer that will not act would leave
 * Escape doing nothing at all.
 */
export const INLINE_EDIT_SELECTOR = '[data-identity-editing="true"]';

/**
 * True when a transient popup is open anywhere.
 *
 * Also the inline editor's own deferral test. React attaches its listeners to the app root, which
 * is a DESCENDANT of `document`, so a bubbling Escape reaches the editor's React handler BEFORE
 * `AlloySelect`'s document-level listener — the editor would cancel itself while its own menu was
 * still open, collapsing two layers on one key. Order cannot be relied on here, so the outer layer
 * asks whether an inner one is open rather than waiting to be told.
 */
export function hasOpenTransientPopup(doc: Document | null | undefined): boolean {
    return Boolean(doc?.querySelector(TRANSIENT_POPUP_SELECTOR));
}

/** True when some layer nested inside the elevated card should consume Escape first. */
export function hasInnerDismissibleLayer(doc: Document | null | undefined): boolean {
    if (!doc) return false;
    if (hasOpenTransientPopup(doc)) return true;
    const active = doc.activeElement;
    return Boolean(active && typeof active.closest === "function" && active.closest(INLINE_EDIT_SELECTOR));
}

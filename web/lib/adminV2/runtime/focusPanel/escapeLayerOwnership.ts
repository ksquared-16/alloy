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
 * An open FINANCIALS DEPTH CARD — Manage responsibility, and Manage discounts.
 *
 * EVERY depth card belongs in this selector, and forgetting one reproduces the defect exactly.
 * Measured on deployed 76a8f3fc8: the discount card carried the same host guard responsibility
 * has, and Escape still closed the whole Details surface with focus landing on <body> — because
 * the guard is a React bubble handler and the grid listens at window CAPTURE. Registering here is
 * the only thing that makes a parent yield; a per-card guard cannot win that race.
 *
 * MEASURED on deployed 33e8a90d9: with the card open on Financials Details, one Escape closed the
 * card AND the whole Details surface, leaving focus on <body>. The card already answers Escape in
 * its host and stops it there, but that handler is a React BUBBLE listener on the app root, and the
 * grid's is CAPTURE on `window` — the earliest listener in the document. The grid therefore
 * dismissed the elevated card before the depth card's own handler ever ran. Registering here is how
 * a nested layer declares itself, and is why this file exists rather than a second Escape listener.
 *
 * Like the inline editor, it counts only when it also HOLDS FOCUS: the card's dismissal runs from
 * its own `onKeyDown`, which cannot fire unless focus is inside it, and yielding to a layer that
 * will not act would leave Escape doing nothing at all. The panel takes focus when it opens
 * (`tabIndex={-1}` plus a focusing ref), so this is true exactly while it is the innermost thing.
 */
export const FINANCIALS_DEPTH_CARD_SELECTOR =
    '[data-financials-manage-responsibility="open-panel"], [data-financials-manage-discounts="open-panel"]';

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
    if (!active || typeof active.closest !== "function") return false;
    return Boolean(active.closest(INLINE_EDIT_SELECTOR) || active.closest(FINANCIALS_DEPTH_CARD_SELECTOR));
}

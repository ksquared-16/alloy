/**
 * CARD + ITEM FOCUS AS AN ATTENTION ASPECT.
 *
 * The kernel's scope nesting is SURFACE ⊃ LENS ⊃ SUBJECT ⊃ ASPECT. "Which card of this record, and
 * which row inside it" is precisely an ASPECT: it is finer than the Operational Subject, it changes
 * nothing coarser, and an ASPECT movement is already defined to inherit target/lens/subject — so it
 * cannot cancel subject or lens preparation. The scope existed and was fully implemented; nothing in
 * the product had ever produced one.
 *
 * That is the whole reason this lives here rather than in `AdminDrawerContext`. Card focus is part of
 * where the operator is attending, not drawer state. Routing it through `openDrawer` mounts the modal
 * overlay on a work-unit surface — `AdminEntityDrawer` suppresses itself by testing `usePathname()`,
 * which cannot see the address the kernel projects with `replaceState` — and that modal is the exact
 * negative reference this work exists to remove.
 *
 * ── WHY A STRING ──
 *
 * `AttentionRef.aspect` is a single string, and it stays one. Widening the kernel's type for one
 * caller would make every owner carry a shape only the Focus Panel understands, and the kernel is
 * explicit that its owned state is "scope + target and its supersession identity. Nothing else."
 * Encoding here keeps K1 ignorant of cards while giving exactly one module the parse/format
 * authority.
 *
 * The encoding is URL-safe on purpose: `urlFromAttention` already projects `?aspect=`, and
 * `attentionFromUrl` already reads it on cold load. So a focused card becomes deep-linkable and
 * survives reload with no further work — the URL stays a projection of attention, never its cause.
 */

/** The card + row an operator asked to look at inside the committed subject's Focus Panel. */
export type AttentionCardFocus = {
    card_key: string;
    /** The row inside a collection card (child id, person id, …). */
    item_id: string | null;
    /** Configured operational context within the card, e.g. a `process_key`. */
    context_key: string | null;
};

const FIELD_SEPARATOR = "|";
const PAIR_SEPARATOR = ":";

/** `card:children|item:cm-joe` — absent parts are omitted rather than encoded as empty. */
export function formatCardFocusAspect(focus: AttentionCardFocus | null | undefined): string | null {
    const card = (focus?.card_key ?? "").trim();
    if (!card) return null;

    const parts = [`card${PAIR_SEPARATOR}${encodeURIComponent(card)}`];
    const item = (focus?.item_id ?? "").trim();
    if (item) parts.push(`item${PAIR_SEPARATOR}${encodeURIComponent(item)}`);
    const context = (focus?.context_key ?? "").trim();
    if (context) parts.push(`context${PAIR_SEPARATOR}${encodeURIComponent(context)}`);
    return parts.join(FIELD_SEPARATOR);
}

/**
 * Parse an aspect back into a card focus, or null.
 *
 * Returns null for anything that is not a card-focus aspect — an aspect authored by some future
 * producer for a different purpose must not be misread as a card request, and a malformed value must
 * not focus an arbitrary card. Hostile input reaches this via `?aspect=` on a cold load.
 */
export function parseCardFocusAspect(aspect: string | null | undefined): AttentionCardFocus | null {
    const raw = (aspect ?? "").trim();
    if (!raw) return null;

    let card = "";
    let item: string | null = null;
    let context: string | null = null;

    for (const field of raw.split(FIELD_SEPARATOR)) {
        const at = field.indexOf(PAIR_SEPARATOR);
        if (at < 0) return null;
        const key = field.slice(0, at);
        let value: string;
        try {
            value = decodeURIComponent(field.slice(at + 1)).trim();
        } catch {
            return null;
        }
        if (!value) return null;
        if (key === "card") card = value;
        else if (key === "item") item = value;
        else if (key === "context") context = value;
        else return null;
    }

    if (!card) return null;
    return { card_key: card, item_id: item, context_key: context };
}

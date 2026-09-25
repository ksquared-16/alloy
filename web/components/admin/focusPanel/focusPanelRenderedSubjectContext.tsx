"use client";

import { createContext, useContext } from "react";

/**
 * WHOSE PAYLOAD THE FOCUS PANEL CARDS ARE ACTUALLY RENDERING — diagnostic only.
 *
 * Read-only, holds one string, performs no fetch, owns no cache and decides nothing. It exists so a
 * measurement can ask "is this card showing B yet?" instead of "does a card exist?", which is the
 * question three earlier instrumentation attempts could not answer.
 *
 * IT DELIBERATELY DOES NOT CARRY THE SELECTED SUBJECT. `data-focus-panel-body-subject` is the
 * committed operational snapshot, and the panel's own contract says that id commits to the
 * destination FAST while the record VM lands later: "if the header followed the fast commit while
 * the body held the prior grid, the panel would show the destination identity over the prior
 * subject's cards — a mixed-subject frame". A diagnostic fed from that id would therefore label A's
 * retained cards as B, which is the precise thing the measurement must never do.
 *
 * The honest value is the id of the payload the cards were rendered FROM — `visible.displayVm.entity.id`,
 * where `visible` is `resolved ?? heldPrior`. During a hold it names A, because A is what is on
 * screen; it becomes B only at the atomic swap, when B's cards are the ones being shown.
 *
 * Null when nothing is rendered. Consumers omit the attribute rather than emitting a guess: an
 * absent attribute reads as UNKNOWN, which is true, and never asserts a subject a card cannot vouch for.
 */
const FocusPanelRenderedSubjectContext = createContext<string | null>(null);

export const FocusPanelRenderedSubjectProvider = FocusPanelRenderedSubjectContext.Provider;

/** The subject whose payload the surrounding cards are rendering, or null when unknown. */
export function useFocusPanelRenderedSubject(): string | null {
    return useContext(FocusPanelRenderedSubjectContext);
}

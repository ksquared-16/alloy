/**
 * Focus Panel navigation target — subject + card + optional item.
 *
 * The canonical answer to "take the operator to THIS thing". Before this existed,
 * the only way to open a record from elsewhere in Alloy was the generic AdminV2
 * drawer product: an entity-type + entity-id pair that opened a modal overlay on
 * top of the workspace. That address could say *which record* but never *which
 * card*, so "open Lennon" and "open Lennon's enrollment" were literally the same
 * request — which is why Search collapsed them into one destination.
 *
 * A Focus Panel target is addressed the way an operator actually thinks:
 *
 *     subject   — whose world am I in
 *     cardKey   — which card of that world
 *     itemId    — which row inside that card, when the card is a collection
 *     contextKey— optional operational context (e.g. a configured process)
 *
 * OWNERSHIP. This contract belongs to the Focus Panel runtime. Search — and any
 * other caller — resolves INTENT into a target; the Focus Panel owns what a card
 * is and how it is revealed. Callers must not grow their own card vocabulary.
 *
 * COMMIT SEMANTICS. A target is a request, not a commit. It is handed to K3
 * (`web/lib/runtime/kernel/focus.ts`), which commits atomically on
 * `preparation.terminal` and on nothing else — "a surface is never shown before
 * it is Operational… there is no partial arrival". Deliberately absent, and it
 * must stay absent: any seed/preview payload that would let a caller paint a
 * half-populated card before it is Operational. Perceived speed comes from
 * acknowledging intent immediately and warm-prefetching the target, never from
 * revealing an unready surface.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

/**
 * Canonical subject kinds a Focus Panel target can address.
 *
 * These are IDENTITY kinds. A process is never a subject — participation is a
 * context ON a subject, which is what keeps one child from becoming three
 * identities when they participate in three processes.
 */
export type FocusPanelSubjectType = "person" | "child" | "household" | "location";

export type FocusPanelSubjectRef = {
    type: FocusPanelSubjectType;
    id: string;
    /**
     * The record whose Focus Panel actually hosts this subject. A child's world
     * is rendered by the case/opportunity it participates in; the subject stays
     * the child. Absent when the subject hosts its own panel.
     */
    hostEntityType?: "opportunities" | "customers" | "persons" | null;
    hostEntityId?: string | null;
};

export type FocusPanelCardFocus = {
    /** Which card to open/centre. Must be a catalogued card key. */
    cardKey: FocusPanelCardKey;
    /** Which row inside a collection card (child id, person id, …). */
    itemId?: string | null;
    /**
     * Operational context to select within the card — e.g. a configured
     * `process_key`. Always a CONFIGURED key, never a hardcoded process name.
     */
    contextKey?: string | null;
};

/** A complete "take me here" request. */
export type FocusPanelTarget = {
    subject: FocusPanelSubjectRef;
    focus: FocusPanelCardFocus;
};

/**
 * The event a caller dispatches to request focus.
 *
 * An event rather than a direct call because the requester (a search box, a card
 * link, a notification) is not mounted inside the Focus Panel and must not hold a
 * reference to it.
 */
export const FOCUS_PANEL_TARGET_EVENT = "alloy:focus-panel-target" as const;

export type FocusPanelTargetEventDetail = FocusPanelTarget & {
    /**
     * Monotonically increasing per dispatch. The Focus Panel keeps the HIGHEST
     * request it has seen, so a slow earlier target can never overwrite a newer
     * one — the same latest-wins rule K3 already enforces for commits.
     */
    requestId: number;
    /** Where the request came from, for telemetry. Never affects authorization. */
    source?: string;
};

let requestCounter = 0;

/** Next monotonic request id. Exported for tests that assert ordering. */
export function nextFocusPanelRequestId(): number {
    requestCounter += 1;
    return requestCounter;
}

/** Test seam — request ids are module-global. */
export function resetFocusPanelRequestIdForTests(): void {
    requestCounter = 0;
}

function isNonEmpty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/** A target is usable only if it names both a subject and a card. */
export function isValidFocusPanelTarget(target: unknown): target is FocusPanelTarget {
    if (!target || typeof target !== "object") return false;
    const t = target as FocusPanelTarget;
    return (
        !!t.subject &&
        isNonEmpty(t.subject.id) &&
        ["person", "child", "household", "location"].includes(t.subject.type) &&
        !!t.focus &&
        isNonEmpty(t.focus.cardKey)
    );
}

/**
 * Request focus. Returns false when the target is unusable, so callers can fall
 * back rather than silently doing nothing.
 *
 * This never navigates by itself and never opens an overlay: it states intent and
 * lets the Focus Panel + K3 decide when the destination is Operational.
 */
export function requestFocusPanelTarget(target: FocusPanelTarget, source?: string): boolean {
    if (typeof window === "undefined") return false;
    if (!isValidFocusPanelTarget(target)) return false;

    const detail: FocusPanelTargetEventDetail = {
        ...target,
        requestId: nextFocusPanelRequestId(),
        source,
    };
    window.dispatchEvent(new CustomEvent(FOCUS_PANEL_TARGET_EVENT, { detail }));
    return true;
}

/**
 * Keep the newer of two requests.
 *
 * Rapid selection is the normal case — an operator clicks one search result and
 * immediately another. The later request wins regardless of which hydration
 * finishes first.
 */
export function latestFocusPanelRequest(
    current: FocusPanelTargetEventDetail | null,
    incoming: FocusPanelTargetEventDetail
): FocusPanelTargetEventDetail {
    if (!current) return incoming;
    return incoming.requestId > current.requestId ? incoming : current;
}

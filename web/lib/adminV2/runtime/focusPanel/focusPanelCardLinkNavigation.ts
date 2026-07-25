/**
 * Focus Panel Card Link navigation runtime — history + destination resolution.
 *
 * Completes the Card Links foundation: field / summary row / repeated identity
 * item / milestone / CTA → card, with active-card state, back stack, optional
 * forward stack, and graceful handling when the destination is unavailable.
 *
 * Never tears down the route or opens a second Focus Panel.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    navigateFocusPanelCardLink,
    peekFocusPanelCardLinkBack,
    pushFocusPanelCardLinkHistory,
    type FocusPanelCardLink,
    type FocusPanelCardLinkHistoryEntry,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinks";

export type FocusPanelCardLinkNavState = {
    history: FocusPanelCardLinkHistoryEntry[];
    /** Entries popped by Back; cleared on a fresh forward navigation. */
    forward: FocusPanelCardLinkHistoryEntry[];
    activeCard: FocusPanelCardKey | null;
};

export function createEmptyFocusPanelCardLinkNavState(): FocusPanelCardLinkNavState {
    return { history: [], forward: [], activeCard: null };
}

export type NavigateCardLinkArgs = {
    coordination: FocusPanelCoordination | undefined;
    link: Pick<FocusPanelCardLink, "toCard" | "fromCard" | "id" | "fromFieldKey" | "label">;
    /** Focus id on the destination card (item id / group key). */
    destinationFocus?: string | null;
    /** Focus id to restore on the source card when going Back. */
    sourceFocus?: string | null;
    nav: FocusPanelCardLinkNavState;
    now?: number;
};

export type NavigateCardLinkResult = {
    ok: boolean;
    reason?: "no_coordination" | "destination_unavailable";
    nav: FocusPanelCardLinkNavState;
};

/** Navigate via Card Link, pushing source onto the back stack and clearing forward. */
export function navigateCardLinkWithHistory(args: NavigateCardLinkArgs): NavigateCardLinkResult {
    const destinationFocus = args.destinationFocus ?? null;
    const sourceFocus = args.sourceFocus ?? null;
    const now = args.now ?? Date.now();
    const ok = navigateFocusPanelCardLink(
        args.coordination,
        args.link,
        destinationFocus,
        sourceFocus,
    );
    if (!ok) {
        const unavailable =
            args.coordination
            && args.coordination.focusTargets
            && !args.coordination.focusTargets.has(args.link.toCard);
        return {
            ok: false,
            reason: unavailable ? "destination_unavailable" : "no_coordination",
            nav: args.nav,
        };
    }
    const sourceEntry: FocusPanelCardLinkHistoryEntry = {
        card: args.link.fromCard,
        focus: sourceFocus,
        at: now,
    };
    const destEntry: FocusPanelCardLinkHistoryEntry = {
        card: args.link.toCard,
        focus: destinationFocus,
        at: now,
    };
    // Keep a contiguous trail: … → source → dest (Back peeks second-to-last).
    let history = args.nav.history;
    const last = history[history.length - 1];
    if (!last || last.card !== sourceEntry.card || last.focus !== sourceEntry.focus) {
        history = pushFocusPanelCardLinkHistory(history, sourceEntry);
    }
    history = pushFocusPanelCardLinkHistory(history, destEntry);
    return {
        ok: true,
        nav: {
            history,
            forward: [],
            activeCard: args.link.toCard,
        },
    };
}

export function goBackCardLink(args: {
    coordination: FocusPanelCoordination | undefined;
    nav: FocusPanelCardLinkNavState;
}): NavigateCardLinkResult {
    const back = peekFocusPanelCardLinkBack(args.nav.history);
    if (!back) {
        return { ok: false, reason: "no_coordination", nav: args.nav };
    }
    const current = args.nav.history[args.nav.history.length - 1] ?? null;
    const ok = navigateFocusPanelCardLink(
        args.coordination,
        { toCard: back.card, fromCard: current?.card ?? back.card },
        back.focus,
    );
    if (!ok) {
        return {
            ok: false,
            reason:
                args.coordination?.focusTargets && !args.coordination.focusTargets.has(back.card)
                    ? "destination_unavailable"
                    : "no_coordination",
            nav: args.nav,
        };
    }
    const history = args.nav.history.slice(0, -1);
    const forward = current
        ? pushFocusPanelCardLinkHistory(args.nav.forward, current)
        : args.nav.forward;
    return {
        ok: true,
        nav: {
            history,
            forward,
            activeCard: back.card,
        },
    };
}

export function goForwardCardLink(args: {
    coordination: FocusPanelCoordination | undefined;
    nav: FocusPanelCardLinkNavState;
}): NavigateCardLinkResult {
    const next = args.nav.forward[args.nav.forward.length - 1];
    if (!next) {
        return { ok: false, reason: "no_coordination", nav: args.nav };
    }
    const ok = navigateFocusPanelCardLink(
        args.coordination,
        { toCard: next.card, fromCard: args.nav.activeCard ?? next.card },
        next.focus,
    );
    if (!ok) {
        return {
            ok: false,
            reason:
                args.coordination?.focusTargets && !args.coordination.focusTargets.has(next.card)
                    ? "destination_unavailable"
                    : "no_coordination",
            nav: args.nav,
        };
    }
    const forward = args.nav.forward.slice(0, -1);
    const history = pushFocusPanelCardLinkHistory(args.nav.history, next);
    return {
        ok: true,
        nav: {
            history,
            forward,
            activeCard: next.card,
        },
    };
}

/** Resolve a link for a repeated identity item (fromFieldKey = item id or fieldRef). */
export function resolveCardLinkForIdentityItem(args: {
    links: readonly FocusPanelCardLink[] | null | undefined;
    fromCard: FocusPanelCardKey;
    fieldKey?: string | null;
    itemId?: string | null;
}): FocusPanelCardLink | null {
    if (!args.links?.length) return null;
    const candidates = [args.itemId, args.fieldKey].filter(Boolean) as string[];
    for (const key of candidates) {
        const match = args.links.find(
            (link) => link.fromCard === args.fromCard && (link.fromFieldKey?.trim() || "") === key,
        );
        if (match) return match;
    }
    return (
        args.links.find(
            (link) => link.fromCard === args.fromCard && !link.fromFieldKey?.trim(),
        ) ?? null
    );
}

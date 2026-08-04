/**
 * The parent-safe action model for a booked tour.
 *
 * This is what the communications renderer is allowed to know: a date, a place, and
 * the URLs of actions that are valid *right now*. It deliberately cannot carry an
 * internal action key, an org id, a person id, a booking row, an internal status, or
 * anything about transition configuration or providers — the renderer never sees them,
 * so a template cannot leak them.
 *
 * The URLs are built from credentials minted by the existing invitation authority
 * (`mintActionsFor`). No second token type and no second token table.
 */

import type { MintedAction } from "@/lib/tours/invitation/mintTourInvitation";

export type TourParentActionModel = {
    /** Present when the parent may choose a different time. */
    rescheduleUrl: string | null;
    /** Present when the parent may cancel. */
    cancelUrl: string | null;
    /**
     * Present ONLY when confirmation is a distinct required lifecycle step — i.e. the
     * booking is not already confirmed. An action is not offered merely because a
     * route for it exists.
     */
    confirmUrl: string | null;
};

function actionUrl(baseUrl: string, rawToken: string): string {
    return `${baseUrl.replace(/\/+$/, "")}/tour-booking/${encodeURIComponent(rawToken)}`;
}

/**
 * Build the model from freshly minted credentials.
 *
 * `bookingStatusKey` is read here and NOT passed on: it decides which actions are
 * valid, then stops at this boundary.
 */
export function buildTourParentActionModel(args: {
    actions: readonly MintedAction[];
    baseUrl: string;
    bookingStatusKey: string;
}): TourParentActionModel {
    const base = String(args.baseUrl ?? "").trim();
    if (!base) return { rescheduleUrl: null, cancelUrl: null, confirmUrl: null };

    const find = (kind: string) => args.actions.find((a) => a.actionKind === kind)?.rawToken ?? null;

    const terminal = ["cancelled", "canceled", "completed", "no_show"].includes(args.bookingStatusKey);
    if (terminal) {
        // Nothing is actionable on a tour that is over or called off. Offering a
        // reschedule link here would be an invitation to a dead end.
        return { rescheduleUrl: null, cancelUrl: null, confirmUrl: null };
    }

    const reschedule = find("reschedule_tour");
    const cancel = find("cancel_tour");
    const confirm = args.bookingStatusKey === "confirmed" ? null : find("confirm_tour");

    return {
        rescheduleUrl: reschedule ? actionUrl(base, reschedule) : null,
        cancelUrl: cancel ? actionUrl(base, cancel) : null,
        confirmUrl: confirm ? actionUrl(base, confirm) : null,
    };
}

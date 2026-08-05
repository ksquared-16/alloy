/**
 * THE tour public-action authorizer — Slice C.
 *
 * One helper for every public tour route, so authorization cannot drift between
 * `resolve`, `slots`, `book`, and the narrow action endpoints that follow.
 *
 * This is NOT a general public action executor. The action vocabulary is closed,
 * each kind grants exactly one capability, and no payload can widen a token's
 * authority.
 *
 * WHAT IT REUSES UNCHANGED: the hashed-token pattern
 * (`resolveTourPublicBookingLinkByToken`), expiry, org/opportunity/location
 * scoping, and the existing rate limiting. Slice C adds recipient scoping,
 * action-family scoping, and consumption state on top.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";

export const TOUR_ACTION_KINDS = [
    "view_tour_slots",
    "select_tour_slot",
    "decline_tour",
    "view_tour_details",
    "reschedule_tour",
    "confirm_tour",
    "cancel_tour",
] as const;

export type TourActionKind = (typeof TOUR_ACTION_KINDS)[number];

/**
 * What each action kind is allowed to DO. A token carries one kind, and the
 * kind carries one capability — there is no omnipotent token.
 */
export const TOUR_ACTION_CAPABILITY: Record<
    TourActionKind,
    { readsAvailability: boolean; books: boolean; declines: boolean; confirms: boolean; reschedules: boolean; cancels: boolean }
> = {
    view_tour_slots: { readsAvailability: true, books: false, declines: false, confirms: false, reschedules: false, cancels: false },
    select_tour_slot: { readsAvailability: true, books: true, declines: false, confirms: false, reschedules: false, cancels: false },
    decline_tour: { readsAvailability: false, books: false, declines: true, confirms: false, reschedules: false, cancels: false },
    view_tour_details: { readsAvailability: false, books: false, declines: false, confirms: false, reschedules: false, cancels: false },
    reschedule_tour: { readsAvailability: true, books: false, declines: false, confirms: false, reschedules: true, cancels: false },
    confirm_tour: { readsAvailability: false, books: false, declines: false, confirms: true, reschedules: false, cancels: false },
    cancel_tour: { readsAvailability: false, books: false, declines: false, confirms: false, reschedules: false, cancels: true },
};

/** Reuse policy. Idempotent retries are NOT treated as malicious replay. */
export const TOUR_ACTION_REUSE: Record<TourActionKind, "single_use" | "reusable"> = {
    view_tour_slots: "reusable",
    view_tour_details: "reusable",
    // Consumed on SUCCESS only. A retry after success returns the prior result.
    select_tour_slot: "single_use",
    decline_tour: "single_use",
    // Reusable for viewing availability; consumed on successful replacement.
    reschedule_tour: "reusable",
    confirm_tour: "single_use",
    cancel_tour: "single_use",
};

export type TourAuthFailureCode =
    | "invalid"
    | "expired"
    | "revoked"
    | "consumed"
    | "wrong_action"
    | "recipient_mismatch"
    | "context_mismatch"
    | "legacy_unscoped";

/**
 * Operator- and parent-safe messages. Deliberately uniform: they never reveal
 * WHICH internal check failed, because that difference is an oracle.
 */
const PUBLIC_MESSAGE: Record<TourAuthFailureCode, string> = {
    invalid: "This link is no longer valid.",
    expired: "This link has expired.",
    revoked: "This link is no longer valid.",
    consumed: "This link has already been used.",
    wrong_action: "This link is no longer valid.",
    recipient_mismatch: "This link is no longer valid.",
    context_mismatch: "This link is no longer valid.",
    legacy_unscoped: "This link is no longer valid. Please ask for a new one.",
};

export type TourInvitationRow = {
    id: string;
    org_id: string;
    recipient_person_id: string;
    opportunity_id: string;
    location_id: string;
    status: string;
    expires_at: string | null;
    revoked_at: string | null;
    conversation_thread_id: string | null;
    option_snapshot: Record<string, unknown>;
};

export type TourActionLinkRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    location_id: string;
    invitation_id: string | null;
    recipient_person_id: string | null;
    action_kind: TourActionKind | null;
    booking_id: string | null;
    consumed_at: string | null;
    revoked_at: string | null;
    use_count: number;
    max_uses: number | null;
    is_active: boolean;
    expires_at: string | null;
    authorization_model: string;
};

export type TourActionAuthorization =
    | {
          ok: true;
          link: TourActionLinkRow;
          invitation: TourInvitationRow;
          actionKind: TourActionKind;
          capability: (typeof TOUR_ACTION_CAPABILITY)[TourActionKind];
          /**
           * True when the credential is already spent and the route opted into replay.
           * The route MUST return the existing result and perform no mutation.
           */
          replay: boolean;
      }
    | { ok: false; code: TourAuthFailureCode; message: string };

function deny(code: TourAuthFailureCode): TourActionAuthorization {
    return { ok: false, code, message: PUBLIC_MESSAGE[code] };
}

const LINK_COLUMNS =
    "id, org_id, opportunity_id, location_id, invitation_id, recipient_person_id, action_kind, booking_id, consumed_at, revoked_at, use_count, max_uses, is_active, expires_at, authorization_model";

const INVITATION_COLUMNS =
    "id, org_id, recipient_person_id, opportunity_id, location_id, status, expires_at, revoked_at, conversation_thread_id, option_snapshot";

/**
 * Authorize one public tour action.
 *
 * `requiredAction` is supplied by the ROUTE, never by the caller's payload —
 * that is what stops a request widening its own authority.
 */
export async function authorizeTourAction(args: {
    supabase: SupabaseClient;
    plaintextToken: string;
    requiredAction: TourActionKind;
    /**
     * Opt in to authorizing an already-spent credential as a REPLAY. Only routes that
     * can return the parent's existing result should set this; the returned
     * authorization carries `replay: true` and must not be used to mutate.
     */
    allowConsumedReplay?: boolean;
}): Promise<TourActionAuthorization> {
    const token = String(args.plaintextToken ?? "").trim();
    if (!token) return deny("invalid");

    // Raw tokens are never stored; lookup is by hash.
    const { data, error } = await args.supabase
        .from("tour_public_booking_links")
        .select(LINK_COLUMNS)
        .eq("token_hash", hashFormLinkToken(token))
        .maybeSingle();

    if (error || !data) return deny("invalid");
    const link = data as TourActionLinkRow;

    // A pre-Slice-C link has no recipient. Refuse rather than guess who it was
    // for — the rollout policy is reissue, not silent promotion.
    if (link.authorization_model !== "scoped") return deny("legacy_unscoped");
    if (!link.is_active) return deny("revoked");
    if (link.revoked_at) return deny("revoked");
    if (isPast(link.expires_at)) return deny("expired");

    if (!link.action_kind || link.action_kind !== args.requiredAction) return deny("wrong_action");
    if (!link.invitation_id || !link.recipient_person_id) return deny("legacy_unscoped");

    // Consumption / bounded reuse.
    //
    // NOT decided here. The decision is deferred to the END of this function so that a
    // spent credential still runs every binding check below — recipient, invitation
    // state, org/opportunity/location agreement. Replay is therefore strictly MORE
    // checked than a first use, never less.
    const spent =
        (TOUR_ACTION_REUSE[link.action_kind] === "single_use" && link.consumed_at != null) ||
        (link.max_uses !== null && link.use_count >= link.max_uses);

    const { data: invData, error: invErr } = await args.supabase
        .from("tour_invitations")
        .select(INVITATION_COLUMNS)
        .eq("id", link.invitation_id)
        .eq("org_id", link.org_id)
        .maybeSingle();

    if (invErr || !invData) return deny("invalid");
    const invitation = invData as TourInvitationRow;

    if (invitation.revoked_at) return deny("revoked");
    if (isPast(invitation.expires_at)) return deny("expired");

    // Which invitation states still permit action.
    //
    // `booked` and `declined` are TERMINAL but still authorize, so a repeat
    // click reaches the route and gets "you already booked / already declined"
    // rather than "this link is no longer valid". A behavioural test caught
    // this: refusing terminal states here turned every idempotent replay into a
    // dead end. The authorizer only answers "is this forged?" — what a terminal
    // state means is the route's decision.
    const usable = ["active", "booked", "declined"];
    if (!usable.includes(invitation.status)) return deny("revoked");

    // THE RECIPIENT BINDING. The token proves possession; this proves the
    // possession was of the invitation sent to the intended person.
    if (link.recipient_person_id !== invitation.recipient_person_id) return deny("recipient_mismatch");

    // Context must agree across link and invitation — a link cannot be pointed
    // at another opportunity, location, or organization.
    if (
        link.org_id !== invitation.org_id ||
        link.opportunity_id !== invitation.opportunity_id ||
        link.location_id !== invitation.location_id
    ) {
        return deny("context_mismatch");
    }

    // A spent credential authorizes ONLY as a replay, and only where the route asked
    // for it. `replay: true` is the route's instruction to return the result the
    // parent already has — it never licenses a new mutation.
    if (spent && !args.allowConsumedReplay) return deny("consumed");

    return {
        ok: true,
        link,
        invitation,
        actionKind: link.action_kind,
        capability: TOUR_ACTION_CAPABILITY[link.action_kind],
        replay: spent,
    };
}

function isPast(iso: string | null): boolean {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t < Date.now();
}

/**
 * Consume a single-use action ATOMICALLY.
 *
 * The `.is("consumed_at", null)` predicate is the concurrency control: two
 * simultaneous booking requests race on this UPDATE and exactly one wins, so at
 * most one canonical booking is created. The loser is told to read the winner's
 * result rather than being treated as an attacker.
 */
export async function consumeTourAction(args: {
    supabase: SupabaseClient;
    linkId: string;
    bookingId?: string | null;
}): Promise<{ consumed: boolean }> {
    const patch: Record<string, unknown> = {
        consumed_at: new Date().toISOString(),
    };
    if (args.bookingId) patch.booking_id = args.bookingId;

    const { data, error } = await args.supabase
        .from("tour_public_booking_links")
        .update(patch)
        .eq("id", args.linkId)
        .is("consumed_at", null)
        .select("id")
        .maybeSingle();

    if (error) return { consumed: false };
    return { consumed: Boolean(data) };
}

/**
 * Invalidate the actions a completed outcome makes meaningless.
 *
 * Booking invalidates outstanding selection and decline actions on the same
 * invitation; declining invalidates selection. Viewing actions are left alone
 * so a parent who books can still open their details link.
 */
export async function invalidateIncompatibleTourActions(args: {
    supabase: SupabaseClient;
    invitationId: string;
    keepLinkId?: string | null;
    reason: "booked" | "declined";
}): Promise<void> {
    const kinds: TourActionKind[] =
        args.reason === "booked" ? ["select_tour_slot", "decline_tour"] : ["select_tour_slot"];

    let q = args.supabase
        .from("tour_public_booking_links")
        .update({ revoked_at: new Date().toISOString(), is_active: false })
        .eq("invitation_id", args.invitationId)
        .in("action_kind", kinds)
        .is("consumed_at", null);

    if (args.keepLinkId) q = q.neq("id", args.keepLinkId);
    await q;
}

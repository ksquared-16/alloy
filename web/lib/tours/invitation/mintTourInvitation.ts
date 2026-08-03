/**
 * THE canonical tour invitation + action minting service — Slice C.
 *
 * The ONLY place a `tour_public_booking_links` row may be created. Routes, UI
 * code and renderers must not mint public actions independently — a second
 * minter is how an unscoped link would reappear after the database constraint
 * was added.
 *
 * ONE INVITATION PER OFFER. Email and SMS deliveries of the same offer share
 * it. That is what stops two transports becoming two competing bookings.
 *
 * RAW TOKENS are returned ONCE, to the trusted server rendering layer, and are
 * never persisted — only the hash and a short prefix are stored.
 */

import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { recordTourEvent } from "@/lib/tours/events/recordTourEvent";
import type { TourActionKind } from "@/lib/tours/public/authorizeTourAction";
import {
    validateTourInvitationContent,
    buildTourInvitationSnapshot,
    type TourInvitationContent,
} from "@/lib/tours/invitation/tourInvitationContent";

/** Actions minted for an initial, pre-booking invitation. */
export const INITIAL_ACTION_KINDS: readonly TourActionKind[] = [
    "view_tour_slots",
    "select_tour_slot",
    "decline_tour",
] as const;

/**
 * Actions minted after a booking exists.
 *
 * `cancel_tour` is deliberately ABSENT: cancellation is consequential, so its
 * credential is minted only when the recipient explicitly enters the bounded
 * cancellation-confirmation flow.
 */
export const POST_BOOKING_ACTION_KINDS: readonly TourActionKind[] = [
    "view_tour_details",
    "confirm_tour",
    "reschedule_tour",
] as const;

/** Bounded reuse budget for the actions that are reusable at all. */
const MAX_USES: Partial<Record<TourActionKind, number>> = {
    view_tour_slots: 50,
    view_tour_details: 50,
    reschedule_tour: 50,
};

export type MintedAction = {
    id: string;
    actionKind: TourActionKind;
    /** Returned ONCE. Never stored, logged, or placed in an event payload. */
    rawToken: string;
};

export type MintInvitationResult =
    | {
          ok: true;
          invitationId: string;
          status: "active";
          actions: MintedAction[];
          idempotentReplay: boolean;
      }
    | { ok: false; code: string; message: string };

function newToken(): string {
    return randomBytes(32).toString("base64url");
}

/**
 * Fingerprint of the facts that define an offer. A retry under the same
 * idempotency key with ANY of these changed is a different offer and is
 * rejected rather than quietly creating a second invitation.
 */
export function invitationFingerprint(args: {
    recipientPersonId: string;
    opportunityId: string;
    locationId: string;
    optionIds: string[];
}): string {
    return [args.recipientPersonId, args.opportunityId, args.locationId, [...args.optionIds].sort().join(",")].join("|");
}

export async function mintTourInvitation(args: {
    supabase: SupabaseClient;
    orgId: string;
    recipientPersonId: string;
    opportunityId: string;
    locationId: string;
    processInstanceId?: string | null;
    childPersonId?: string | null;
    conversationThreadId?: string | null;
    content: TourInvitationContent;
    expiresAt?: string | null;
    createdByUserId?: string | null;
    /** Stable per operator intent. Required — an unkeyed mint cannot be safe on retry. */
    idempotencyKey: string;
}): Promise<MintInvitationResult> {
    const contentViolation = validateTourInvitationContent(args.content);
    if (contentViolation) return { ok: false, code: contentViolation.code, message: contentViolation.message };

    if (!args.idempotencyKey?.trim()) {
        return { ok: false, code: "missing_idempotency_key", message: "An idempotency key is required." };
    }

    const fingerprint = invitationFingerprint({
        recipientPersonId: args.recipientPersonId,
        opportunityId: args.opportunityId,
        locationId: args.locationId,
        optionIds: args.content.options.map((o) => o.optionId),
    });

    // ---- idempotent replay -------------------------------------------------
    const { data: prior } = await args.supabase
        .from("tour_invitations")
        .select("id, status, metadata")
        .eq("org_id", args.orgId)
        .eq("metadata->>idempotency_key", args.idempotencyKey)
        .maybeSingle();

    if (prior) {
        const row = prior as { id: string; status: string; metadata?: Record<string, unknown> | null };
        if (String(row.metadata?.idempotency_fingerprint ?? "") !== fingerprint) {
            return {
                ok: false,
                code: "idempotency_payload_changed",
                message: "This invitation key was already used for a different recipient, location, or set of times.",
            };
        }
        // Raw tokens are NOT re-derivable — that is the point of hashing them.
        // A replay returns the invitation without new credentials; the caller
        // must reuse the URLs it already has, or supersede and reissue.
        return { ok: true, invitationId: row.id, status: "active", actions: [], idempotentReplay: true };
    }

    // ---- create the invitation in `draft` ---------------------------------
    // Draft first, actions second, activate last: an invitation is never left
    // `active` with a partially minted action set.
    const snapshot = buildTourInvitationSnapshot({
        invitationId: "pending",
        capturedAt: new Date().toISOString(),
        content: args.content,
    });

    const { data: created, error: createErr } = await args.supabase
        .from("tour_invitations")
        .insert({
            org_id: args.orgId,
            recipient_person_id: args.recipientPersonId,
            opportunity_id: args.opportunityId,
            location_id: args.locationId,
            process_instance_id: args.processInstanceId ?? null,
            child_person_id: args.childPersonId ?? null,
            conversation_thread_id: args.conversationThreadId ?? null,
            status: "draft",
            expires_at: args.expiresAt ?? null,
            option_snapshot: snapshot,
            metadata: {
                idempotency_key: args.idempotencyKey,
                idempotency_fingerprint: fingerprint,
            },
            created_by: args.createdByUserId ?? null,
        })
        .select("id")
        .maybeSingle();

    if (createErr || !created) {
        return { ok: false, code: "invitation_create_failed", message: "The tour invitation could not be created." };
    }
    const invitationId = (created as { id: string }).id;

    await recordTourEvent(args.supabase, {
        event: "tour_invitation_created",
        orgId: args.orgId,
        invitationId,
        recipientPersonId: args.recipientPersonId,
        opportunityId: args.opportunityId,
        threadId: args.conversationThreadId ?? null,
    });

    const minted = await mintActionsFor({
        supabase: args.supabase,
        orgId: args.orgId,
        invitationId,
        recipientPersonId: args.recipientPersonId,
        opportunityId: args.opportunityId,
        locationId: args.locationId,
        expiresAt: args.expiresAt ?? null,
        kinds: INITIAL_ACTION_KINDS,
        bookingId: null,
    });

    if (!minted.ok) {
        // Compensate: an invitation with no usable actions must not stay around
        // looking activatable.
        await args.supabase
            .from("tour_invitations")
            .update({ status: "revoked", revoked_at: new Date().toISOString() })
            .eq("id", invitationId);
        return { ok: false, code: "action_mint_failed", message: "The tour invitation could not be prepared." };
    }

    // ---- activate only once every action exists ---------------------------
    const { error: activateErr } = await args.supabase
        .from("tour_invitations")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", invitationId)
        .eq("status", "draft");

    if (activateErr) {
        return { ok: false, code: "activation_failed", message: "The tour invitation could not be activated." };
    }

    await recordTourEvent(args.supabase, {
        event: "tour_invitation_activated",
        orgId: args.orgId,
        invitationId,
        recipientPersonId: args.recipientPersonId,
        opportunityId: args.opportunityId,
        threadId: args.conversationThreadId ?? null,
    });

    return { ok: true, invitationId, status: "active", actions: minted.actions, idempotentReplay: false };
}

/**
 * Mint a scoped action set. Every row is written `scoped`, so the database
 * CHECK refuses it unless invitation, recipient and action kind are all present.
 */
export async function mintActionsFor(args: {
    supabase: SupabaseClient;
    orgId: string;
    invitationId: string;
    recipientPersonId: string;
    opportunityId: string;
    locationId: string;
    expiresAt: string | null;
    kinds: readonly TourActionKind[];
    bookingId: string | null;
}): Promise<{ ok: true; actions: MintedAction[] } | { ok: false }> {
    const actions: MintedAction[] = [];

    for (const actionKind of args.kinds) {
        // A DISTINCT token per action kind. One token covering several kinds is
        // exactly the omnipotent credential this design forbids.
        const rawToken = newToken();
        const { data, error } = await args.supabase
            .from("tour_public_booking_links")
            .insert({
                org_id: args.orgId,
                token_hash: hashFormLinkToken(rawToken),
                token_prefix: rawToken.slice(0, 12),
                opportunity_id: args.opportunityId,
                location_id: args.locationId,
                invitation_id: args.invitationId,
                recipient_person_id: args.recipientPersonId,
                action_kind: actionKind,
                booking_id: args.bookingId,
                expires_at: args.expiresAt,
                is_active: true,
                use_count: 0,
                max_uses: MAX_USES[actionKind] ?? null,
                authorization_model: "scoped",
            })
            .select("id")
            .maybeSingle();

        if (error || !data) return { ok: false };
        actions.push({ id: (data as { id: string }).id, actionKind, rawToken });
    }

    return { ok: true, actions };
}

/**
 * Supersede an invitation and revoke every action it still owns.
 *
 * Used when an operator reissues: the old offer must stop being actionable, or
 * a parent holding the earlier email could book against a withdrawn set.
 */
export async function supersedeTourInvitation(args: {
    supabase: SupabaseClient;
    invitationId: string;
    orgId: string;
}): Promise<void> {
    const now = new Date().toISOString();
    await args.supabase
        .from("tour_public_booking_links")
        .update({ revoked_at: now, is_active: false })
        .eq("invitation_id", args.invitationId)
        .is("consumed_at", null);

    await args.supabase
        .from("tour_invitations")
        .update({ status: "superseded", updated_at: now })
        .eq("id", args.invitationId)
        .eq("org_id", args.orgId)
        .in("status", ["draft", "active"]);
}

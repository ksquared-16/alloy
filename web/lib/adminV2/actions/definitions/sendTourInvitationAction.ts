/**
 * Send Tour Invitation (Slice D).
 *
 * The single operator entry point for inviting a family to tour. Registering it means
 * Focus Panel, Current Work, the drawer and BOS all execute the same code — there is
 * no tour-specific endpoint and no second sender.
 *
 * The mutation itself is `sendTourInvitation`, which composes existing capabilities
 * (invitation authority, canonical rendering, canonical enqueue). This file owns only
 * the action contract: what it needs, whether it is eligible, and how failures read.
 */

import { randomUUID } from "crypto";
import {
    eligible,
    type ActionResult,
    type RegisteredAction,
} from "@/lib/adminV2/actions/actionTypes";
import {
    SEND_TOUR_INVITATION_OPERATOR_MESSAGE,
    sendTourInvitation,
} from "@/lib/tours/invitation/sendTourInvitation";

export const SEND_TOUR_INVITATION_ACTION_KEY = "send_tour_invitation";

function trimmed(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function resolveBaseUrl(): string {
    const raw = trimmed(process.env.NEXT_PUBLIC_APP_URL);
    return raw ? raw.replace(/\/+$/, "") : "";
}

export const sendTourInvitationAction: RegisteredAction = {
    actionKey: SEND_TOUR_INVITATION_ACTION_KEY,
    defaultLabel: "Send tour invitation",
    description: "Invite this family to choose a tour time.",
    supportedEntityTypes: ["opportunity"],
    supportedProcessKeys: ["enrollment"],
    requiredContext: { requiresEntityId: true, requiresOpportunity: true, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "communication", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: true,

    validatePayload(payload) {
        const src = payload ?? {};
        const value: Record<string, unknown> = { ...src };
        // An operator note is optional; the invitation stands on its own without one.
        if (src.message_text != null) value.message_text = trimmed(src.message_text);
        if (src.location_id != null) value.location_id = trimmed(src.location_id);
        if (src.mode === "prepare" || src.mode === "send" || src.mode === "mark_sent") {
            value.mode = src.mode;
        }
        if (src.invitation_id != null) value.invitation_id = trimmed(src.invitation_id);
        if (src.channel != null) value.channel = trimmed(src.channel);
        // Optional client-stable key for double-submit within one compose open.
        if (src.idempotency_key != null) value.idempotency_key = trimmed(src.idempotency_key);
        // Never accept a recipient from the caller — identity is resolved server-side.
        delete value.recipient_person_id;
        delete value.to;
        return { ok: true, value };
    },

    async resolveEligibility({ invocation }) {
        const hasRecord = Boolean(invocation.entityId.trim());
        const blockers = hasRecord
            ? []
            : [{ code: "missing_entity", message: "A record is required to send a tour invitation." }];
        return eligible({ eligible: hasRecord, blockers });
    },

    async buildPreview() {
        return {
            summary: "Review and send a tour invitation so this family can choose a time.",
            changes: ["Tour invitation draft → operator confirm → send"],
            before: null,
            after: null,
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const baseUrl = resolveBaseUrl();
        if (!baseUrl) {
            return {
                ok: false,
                correlationId,
                status: 500,
                error: "Tour invitations cannot be sent until the public site address is configured.",
            };
        }

        const src = (payload ?? {}) as Record<string, unknown>;
        // Default prepare: operator compose must confirm before enqueue. Explicit mode:"send"
        // remains for programmatic / confirmed delivery paths. mark_sent records activation
        // after a successful Communications compose send of a prepared invitation.
        const mode =
            src.mode === "send" ? "send" : src.mode === "mark_sent" ? "mark_sent" : "prepare";

        if (mode === "mark_sent") {
            const invitationId = trimmed(src.invitation_id);
            if (!invitationId) {
                return {
                    ok: false,
                    correlationId,
                    status: 422,
                    error: "Invitation id is required to record a sent invitation.",
                };
            }
            const { recordTourEvent } = await import("@/lib/tours/events/recordTourEvent");
            await recordTourEvent(supabase, {
                event: "tour_invitation_activated",
                orgId: ctx.orgId,
                invitationId,
                recipientPersonId: null,
                opportunityId: invocation.entityId,
                detail: {
                    channel: trimmed(src.channel) || "compose",
                    ...(trimmed(src.recipient_display_name)
                        ? { recipient_display_name: trimmed(src.recipient_display_name) }
                        : {}),
                },
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: SEND_TOUR_INVITATION_ACTION_KEY,
                    entityType: "opportunity",
                    entityId: invocation.entityId,
                    affectedId: invitationId,
                    detail: {
                        invitation_id: invitationId,
                        mode: "mark_sent",
                        sent_channels: trimmed(src.channel) ? [trimmed(src.channel)] : [],
                    },
                },
            };
        }

        // Each operator invocation gets a fresh prepare key. A fixed
        // `send_tour_invitation:org:opp` key collided when availability/fingerprint
        // changed between clicks ("already used for a different … set of times").
        // Double-submit within one click still shares one key via the client payload.
        const idempotencyKey =
            trimmed(src.idempotency_key)
            || `send_tour_invitation:${ctx.orgId}:${invocation.entityId}:${correlationId}`;

        const result = await sendTourInvitation({
            supabase,
            orgId: ctx.orgId,
            opportunityId: invocation.entityId,
            actorUserId: ctx.userId ?? null,
            locationId: trimmed(src.location_id) || null,
            messageText: trimmed(src.message_text) || null,
            baseUrl,
            idempotencyKey,
            mode,
        });

        if (!result.ok) {
            return {
                ok: false,
                correlationId,
                status: result.code === "missing_opportunity" ? 404 : 422,
                error: result.message || SEND_TOUR_INVITATION_OPERATOR_MESSAGE[result.code],
            };
        }

        return {
            ok: true,
            correlationId,
            result: {
                actionKey: SEND_TOUR_INVITATION_ACTION_KEY,
                entityType: "opportunity",
                entityId: invocation.entityId,
                affectedId: result.invitationId,
                detail: {
                    invitation_id: result.invitationId,
                    option_count: result.optionCount,
                    sent_channels: result.sentChannels,
                    idempotent_replay: result.idempotentReplay,
                    skipped: result.skippedReasons,
                    mode,
                    draft: result.draft ?? null,
                },
            },
        };
    },
};

/**
 * Send enrollment paperwork — the operator's ONE action on the Enrolling stage.
 *
 * The Enrolling stage requires `send_enrollment_packet` and had no executable action, so getting
 * paperwork to a family meant Processing Studio → Packets → copy an Intake URL. That is not an
 * operator workflow: it has no recipient, no thread, no audit, and it asks the operator to choose a
 * packet the Process already chose.
 *
 * Registering it means the Focus Panel, Current Work, the Business Process card and BOS all execute
 * the same code. There is no enrollment-specific send endpoint and no second sender.
 *
 * ── THE SUBJECT IS THE DURABLE CHILD ──
 *
 * `customer_members.id`, exactly like `enrollment.start`, because paperwork is about one child. A
 * family-grain subject would have to guess which child a two-child household's paperwork was for.
 *
 * ── THREE MODES, THE TOUR CONTRACT ──
 *
 *   prepare    create/resume the episode, render an editable draft. SENDS NOTHING.
 *   mark_sent  record that the operator's confirmed Communications send happened.
 *
 * `send` is deliberately absent. Tour keeps one for programmatic delivery; enrollment paperwork has
 * no such caller today, and an unused silent-send mode is an unguarded way for a message to reach a
 * family without anyone confirming it.
 *
 * @see web/lib/enrollment/paperwork/sendEnrollmentPaperwork.ts
 * @see web/lib/adminV2/actions/definitions/sendTourInvitationAction.ts — the precedent
 */

import { randomUUID } from "crypto";

import { eligible, type ActionResult, type RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import {
    ENROLLMENT_PAPERWORK_OPERATOR_MESSAGE,
    prepareEnrollmentPaperwork,
} from "@/lib/enrollment/paperwork/sendEnrollmentPaperwork";

export const SEND_ENROLLMENT_PAPERWORK_ACTION_KEY = "enrollment.send_paperwork";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const sendEnrollmentPaperworkAction: RegisteredAction = {
    actionKey: SEND_ENROLLMENT_PAPERWORK_ACTION_KEY,
    defaultLabel: "Send enrollment paperwork",
    description: "Send this child's enrollment paperwork to their family.",
    supportedEntityTypes: ["child"],
    supportedProcessKeys: ["enrollment"],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "communication", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const src = payload ?? {};
        const value: Record<string, unknown> = { ...src };
        if (src.mode === "mark_sent") value.mode = "mark_sent";
        else value.mode = "prepare";
        if (src.session_id != null) value.session_id = t(src.session_id);
        if (src.channel != null) value.channel = t(src.channel);
        if (src.recipient_display_name != null) {
            value.recipient_display_name = t(src.recipient_display_name);
        }
        /*
         * THE PROCESS IS THE SOLE PACKET SELECTOR.
         *
         * Any packet identity in the request is dropped rather than refused, because a caller that
         * sends one is not attacking anything — it is assuming the old Studio model, where a human
         * picked the packet. Accepting it would let one operator send a different packet than the
         * published Process requires, and nobody downstream could tell.
         */
        delete value.packet_definition_id;
        delete value.packet_id;
        // Never accept a recipient from the caller — identity is resolved from the child's own
        // relationship graph, server-side.
        delete value.recipient_person_id;
        delete value.to;
        return { ok: true, value };
    },

    async resolveEligibility({ invocation }) {
        const hasChild = Boolean(t(invocation.entityId));
        return eligible({
            eligible: hasChild,
            blockers: hasChild
                ? []
                : [{ code: "missing_child", message: ENROLLMENT_PAPERWORK_OPERATOR_MESSAGE.missing_child }],
        });
    },

    async buildPreview() {
        return {
            summary: "Review and send this child's enrollment paperwork to their family.",
            changes: [
                "Create or resume one participant session for this child",
                "Enrollment paperwork draft → operator confirm → send",
            ],
            before: null,
            after: null,
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const src = (payload ?? {}) as Record<string, unknown>;
        const customerMemberId = t(invocation.entityId);

        if (src.mode === "mark_sent") {
            /*
             * The delivery itself is already recorded by Communications — the outbound message, its
             * thread and its delivery state all exist before this runs. What this adds is the
             * OPERATOR-INTENT audit: that the send was this action, for this child, on this episode.
             * The action's own `audit` contract writes it, so there is nothing to write here beyond
             * reporting what was sent.
             */
            const sessionId = t(src.session_id);
            if (!sessionId) {
                return {
                    ok: false,
                    correlationId,
                    status: 422,
                    error: "A participant session is required to record sent paperwork.",
                };
            }
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: SEND_ENROLLMENT_PAPERWORK_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: customerMemberId,
                    affectedId: sessionId,
                    detail: {
                        mode: "mark_sent",
                        session_id: sessionId,
                        sent_channels: t(src.channel) ? [t(src.channel)] : [],
                        ...(t(src.recipient_display_name)
                            ? { recipient_display_name: t(src.recipient_display_name) }
                            : {}),
                    },
                },
            };
        }

        const prepared = await prepareEnrollmentPaperwork(supabase, {
            orgId: ctx.orgId,
            customerMemberId,
        });
        if (!prepared.ok) {
            return {
                ok: false,
                correlationId,
                status: prepared.code === "child_not_found" ? 404 : 422,
                error: prepared.message,
            };
        }

        const d = prepared.draft;
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: SEND_ENROLLMENT_PAPERWORK_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: customerMemberId,
                affectedId: d.sessionId,
                detail: {
                    mode: "prepare",
                    process_instance_id: d.processInstanceId,
                    session_id: d.sessionId,
                    // Reported so an operator (and a test) can see WHICH packet the Process chose.
                    // It is an answer, never an input — `validatePayload` drops any that arrives.
                    packet_definition_id: d.packetDefinitionId,
                    launch_outcome: d.launchOutcome,
                    reused_journey: d.reusedJourney,
                    access_url: d.accessUrl,
                    recipient_person_id: d.recipientPersonId,
                    recipient_display_name: d.recipientDisplayName,
                    recipient_email: d.recipientEmail,
                    recipient_phone: d.recipientPhone,
                    recipient_alternatives: d.recipientAlternatives,
                    subject: d.subject,
                    email_body: d.emailBody,
                    sms_body: d.smsBody,
                },
            },
        };
    },
};
